<?php

namespace App\Domain\Assistant;

use Illuminate\Http\Client\RequestException;
use Illuminate\Validation\ValidationException;
use Throwable;

class FunctionGemma
{
    public function propose(string $message, array $tools, array $collected): array
    {
        $definitions = array_map(function (array $tool): array {
            $parameters = $tool['parameters'];
            foreach (['password', 'password_confirmation'] as $secret) {
                unset($parameters['properties'][$secret]);
                $parameters['required'] = array_values(array_diff($parameters['required'], [$secret]));
            }
            unset($parameters['additionalProperties']);
            $parameters['properties'] = (object) $parameters['properties'];

            return ['type' => 'function', 'function' => ['name' => $tool['name'], 'description' => $tool['description'], 'parameters' => $parameters]];
        }, $tools);
        unset($collected['password'], $collected['password_confirmation']);
        try {
            $response = (new ProposalAgent($definitions, $collected))->prompt($message, provider: 'functiongemma', timeout: config('assistant.timeout'));
        } catch (Throwable $error) {
            if ($error instanceof RequestException && $error->response->status() === 422) {
                throw ValidationException::withMessages(['message' => 'Please clarify the action and its parameters, or select an available action.']);
            }
            abort(503, 'Language service is unavailable.');
        }
        abort_unless($response->toolCalls->count() === 1, 503, 'Invalid language service response.');
        $raw = $response->raw?->json('choices.0.message.tool_calls.0.function.arguments');
        abort_unless(is_string($raw) && is_object(json_decode($raw)), 503, 'Invalid language service arguments.');
        $call = $response->toolCalls->first();
        $proposal = ['name' => $call->name, 'arguments' => $call->arguments];
        if (isset($proposal['arguments']['password']) || isset($proposal['arguments']['password_confirmation'])) {
            throw ValidationException::withMessages(['data.password' => 'Supply credentials through structured data.']);
        }

        $proposal['arguments'] = $this->ground($proposal['arguments'], mb_strtolower($message));

        return $proposal;
    }

    private function ground(array $arguments, string $message): array
    {
        $result = [];
        $words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
        foreach ($arguments as $key => $value) {
            if (is_array($value)) {
                $result[$key] = $this->ground($value, $message);
            } elseif (is_string($value) && $value !== '' && str_contains($message, mb_strtolower($value))) {
                $result[$key] = $value;
            } elseif (is_int($value) && (preg_match('/(?<![0-9])'.preg_quote((string) $value, '/').'(?![0-9])/', $message) || (isset($words[$value]) && preg_match('/\\b'.$words[$value].'\\b/', $message)))) {
                $result[$key] = $value;
            } elseif (is_bool($value) && str_contains($message, $value ? 'true' : 'false')) {
                $result[$key] = $value;
            }
        }

        return array_is_list($arguments) ? array_values($result) : $result;
    }
}
