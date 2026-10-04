<?php

namespace App\Domain\Assistant;

use App\Domain\ActionExecutor;
use App\Domain\StoreActions;
use App\Models\AssistantConversation as Conversation;
use App\Models\Operation;
use App\Models\Order;
use App\Models\PluginInstallation;
use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AssistantActions
{
    public function run(Operation $op, Shop $shop, ?User $user): array
    {
        $input = Validator::make(['turn' => $op->payload['input']], [
            'turn' => 'required|array:conversation_id,conversation_version,message,data,action,confirm,discover',
            'turn.conversation_id' => 'sometimes|uuid', 'turn.conversation_version' => 'required_with:turn.conversation_id|integer:strict|min:0',
            'turn.message' => 'sometimes|string|max:2000', 'turn.data' => 'sometimes|array',
            'turn.action' => 'sometimes|string|max:80', 'turn.confirm' => 'sometimes|boolean:strict', 'turn.discover' => 'sometimes|boolean:strict',
        ])->validate()['turn'];
        $registry = app(ToolRegistry::class);
        $available = $registry->available($user, $shop);
        if ($input['discover'] ?? false) {
            return ['role' => $user?->role ?? 'guest', 'status' => Conversation::Draft, 'message' => 'Choose an action or describe what you want to do.', 'available_actions' => array_map(fn ($tool) => $registry->describe($tool, $shop->slug, $shop), $available), 'required_input' => [['field' => 'message', 'type' => 'string']]];
        }
        if (isset($input['conversation_id'])) {
            $conversation = Conversation::where('public_id', $input['conversation_id'])->where('shop_id', $shop->id)->lockForUpdate()->firstOrFail();
            abort_unless($conversation->user_id === $user?->id && hash_equals($conversation->receipt_hash, $op->receipt_hash), 404);
            abort_unless($conversation->auth_version === $user?->auth_version, 403);
            abort_if($conversation->expires_at->isPast(), 410, 'Conversation expired. Start a new request.');
            abort_unless($conversation->version === $input['conversation_version'], 409, 'Conversation changed. Use the latest version.');
            if ($conversation->status === Conversation::Complete) {
                return $conversation->result;
            }
        } else {
            $conversation = Conversation::create(['public_id' => (string) Str::uuid(), 'shop_id' => $shop->id, 'user_id' => $user?->id, 'auth_version' => $user?->auth_version, 'receipt_hash' => $op->receipt_hash, 'draft' => [], 'expires_at' => now()->addMinutes(config('assistant.ttl_minutes'))]);
        }
        $draft = $conversation->draft;
        $arguments = $draft['arguments'] ?? [];
        $name = $conversation->action ?? ($input['action'] ?? null);
        if ($conversation->action && isset($input['action']) && $input['action'] !== $conversation->action) {
            throw ValidationException::withMessages(['action' => 'Start a new conversation to change action.']);
        }
        if ($input['confirm'] ?? false) {
            abort_unless($conversation->status === Conversation::Confirm && empty($input['data']) && empty($input['message']), 409, 'Confirm the unchanged preview in a separate turn.');
            $tool = $registry->find($name, $user, $shop);

            return $this->execute($conversation, $tool, $draft['prepared'], $op, $shop, $user);
        }
        if (! empty($input['message'])) {
            $tools = $name ? [$registry->find($name, $user, $shop)] : $available;
            $proposal = app(FunctionGemma::class)->propose($input['message'], $tools, $arguments);
            if ($name && $proposal['name'] !== $name) {
                throw ValidationException::withMessages(['message' => 'The reply did not match the pending action.']);
            }
            $name = $proposal['name'];
            $arguments = $this->merge($arguments, $proposal['arguments']);
        }
        if (! $name) {
            throw ValidationException::withMessages(['message' => 'Describe an action or select one from discovery.']);
        }
        $tool = $registry->find($name, $user, $shop);
        $arguments = $this->merge($arguments, $input['data'] ?? []);
        $missing = app(ToolInput::class)->check($tool['parameters'], $arguments);
        $choices = [];
        if ($tool['action'] === 'cart.update' && ! array_key_exists('items', $arguments)) {
            if (! isset($arguments['product_id']) && ! empty($arguments['product_query'])) {
                $matches = app(StoreActions::class)->products(Request::create('/', 'GET', ['search' => $arguments['product_query']]), $shop)['products'];
                $choices = $matches;
                if (count($matches['data']) === 1) {
                    $arguments['product_id'] = $matches['data'][0]['id'];
                }
            }
            foreach (['product_id', 'quantity'] as $field) {
                if (! isset($arguments[$field])) {
                    $missing[] = ['field' => 'data.'.$field, 'type' => 'integer', 'minimum' => 1];
                }
            }
        }
        $conversation->action = $name;
        $conversation->version++;
        $conversation->status = $missing ? Conversation::Draft : Conversation::Confirm;
        $prepared = $missing ? [] : $this->prepare($tool, $arguments, $shop, $user);
        $conversation->draft = ['arguments' => $arguments, 'prepared' => $prepared];
        $conversation->save();
        if (! $missing && ! $tool['confirmation'] && empty($input['message'])) {
            return $this->execute($conversation, $tool, $prepared, $op, $shop, $user);
        }
        $visible = $arguments;
        unset($visible['password'], $visible['password_confirmation']);

        return ['conversation_id' => $conversation->public_id, 'conversation_version' => $conversation->version, 'status' => $conversation->status,
            'message' => $missing ? 'Please provide: '.implode(', ', array_column($missing, 'field')).'.' : 'Review the action and data, then send confirm: true with this conversation version.',
            'available_actions' => [$registry->describe($tool, $shop->slug, $shop)], 'collected_data' => $visible, 'required_input' => $missing,
            'choices' => $choices, 'preview' => $this->redact($prepared), 'options' => Conversation::options()];
    }

    private function merge(array $base, array $patch): array
    {
        foreach ($patch as $key => $value) {
            $base[$key] = is_array($value) && ! array_is_list($value) && is_array($base[$key] ?? null) ? $this->merge($base[$key], $value) : $value;
        }

        return $base;
    }

    private function prepare(array $tool, array $arguments, Shop $shop, ?User $user): array
    {
        $action = $tool['action'];
        $id = $arguments['id'] ?? null;
        unset($arguments['id']);
        if ($action === 'cart.update') {
            if (array_key_exists('items', $arguments) && (isset($arguments['product_id']) || isset($arguments['product_query']) || isset($arguments['quantity']))) {
                throw ValidationException::withMessages(['data' => 'Choose either an items replacement or a product addition.']);
            }
            if (! array_key_exists('items', $arguments)) {
                $items = $user->cart ?? [];
                $found = false;
                foreach ($items as &$line) {
                    if ($line['product_id'] === $arguments['product_id']) {
                        $line['quantity'] += $arguments['quantity'];
                        $found = true;
                    }
                }
                unset($line);
                if (! $found) {
                    $items[] = ['product_id' => $arguments['product_id'], 'quantity' => $arguments['quantity']];
                }
                $arguments = ['items' => $items];
            }
        }
        if (in_array($action, ['cart.update', 'checkout'], true)) {
            $arguments['expected_version'] = $user->version;
        }
        if (in_array($action, ['admin.update', 'admin.delete', 'admin.advance', 'admin.plugin.update'], true)) {
            if ($action === 'admin.plugin.update') {
                $record = PluginInstallation::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($id);
                $arguments['expected_version'] = $record->version;
            } else {
                $model = $action === 'admin.advance' ? Order::class : Product::class;
                $record = $model::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($id);
                $arguments['expected_version'] = $record->version;
            }
        }
        $quote = [];
        if ($action === 'checkout') {
            $arguments['checkout_key'] = (string) Str::uuid();
            foreach ($user->cart ?? [] as $line) {
                $product = Product::where('shop_id', $shop->id)->where('active', true)->findOrFail($line['product_id']);
                $quote[] = ['product_id' => $product->id, 'name' => $product->name, 'quantity' => $line['quantity'], 'price' => $product->price, 'version' => $product->version];
            }
        }

        return ['input' => $arguments, 'id' => $id, 'quote' => $quote, 'total_sen' => $action === 'checkout' ? array_sum(array_map(fn ($line) => $line['price'] * $line['quantity'], $quote)) + 800 : null];
    }

    private function redact(array $prepared): array
    {
        unset($prepared['input']['password'], $prepared['input']['password_confirmation']);

        return $prepared;
    }

    private function execute(Conversation $conversation, array $tool, array $prepared, Operation $parent, Shop $shop, ?User $user): array
    {
        foreach ($prepared['quote'] as $line) {
            $product = Product::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($line['product_id']);
            abort_unless($product->version === $line['version'] && $product->price === $line['price'], 409, 'The quoted product changed. Start a new checkout.');
        }
        $child = new Operation(['shop_id' => $shop->id, 'user_id' => $user?->id, 'auth_version' => $parent->auth_version, 'token_id' => $parent->token_id, 'action' => $tool['action'], 'payload' => ['input' => $prepared['input'], 'id' => $prepared['id']]]);
        $child->id = $parent->id;
        $result = app(ActionExecutor::class)->execute($child);
        $conversation->status = Conversation::Complete;
        $conversation->draft = [];
        $response = ['conversation_id' => $conversation->public_id, 'conversation_version' => $conversation->version, 'status' => Conversation::Complete, 'message' => 'The '.$tool['name'].' action completed successfully.', 'executed_action' => $tool['action'], 'available_actions' => [app(ToolRegistry::class)->describe($tool, $shop->slug, $shop)], 'required_input' => [], 'api_result' => $result];
        $conversation->result = $response;
        $conversation->save();

        return $response;
    }
}
