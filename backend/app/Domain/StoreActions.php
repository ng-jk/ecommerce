<?php

namespace App\Domain;

use App\Domain\Payments\PaymentProviders;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use App\Support\PublicData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StoreActions extends Controller
{
    public function products(Request $request, Shop $shop): array
    {
        $data = $this->validate($request, ['search' => 'nullable|string|max:100', 'category' => 'nullable|string|max:80', 'page' => 'nullable|integer|min:1']);
        $query = Product::where('shop_id', $shop->id)->where('active', true);
        $categories = (clone $query)->distinct()->orderBy('category')->pluck('category');
        if (! empty($data['search'])) {
            if (DB::getDriverName() === 'pgsql') {
                $query->whereRaw("search_vector @@ plainto_tsquery('simple', ?)", [$data['search']]);
            } else {
                $query->whereRaw('LOWER(name) LIKE ?', ['%'.strtolower($data['search']).'%']);
            }
        }
        if (! empty($data['category'])) {
            $query->where('category', $data['category']);
        }

        return ['shop' => $shop, 'categories' => $categories, 'products' => PublicData::page($query->orderBy('id')->paginate(24, ['*'], 'page', (int) ($data['page'] ?? 1)))];
    }

    public function product(Shop $shop, int $id): array
    {
        return ['product' => Product::where('shop_id', $shop->id)->where('active', true)->findOrFail($id)];
    }

    public function cart(Request $request, Shop $shop): array
    {
        $lines = $request->user()->cart ?? [];
        $products = Product::where('shop_id', $shop->id)->whereIn('id', array_column($lines, 'product_id'))->get()->keyBy('id');

        return ['version' => $request->user()->version, 'items' => array_map(fn ($line) => [...$line, 'product' => $products->get($line['product_id'])], $lines),
            ...app(PaymentProviders::class)->options($shop->slug)];
    }

    public function updateCart(Request $request, Shop $shop): array
    {
        $data = $this->validate($request, ['items' => 'present|array|list|max:50', 'items.*.product_id' => 'required|integer:strict|min:1|distinct', 'items.*.quantity' => 'required|integer:strict|min:1|max:99']);
        $lines = array_map(fn ($line) => ['product_id' => $line['product_id'], 'quantity' => $line['quantity']], $data['items']);
        foreach ($lines as $line) {
            $product = Product::where('shop_id', $shop->id)->where('active', true)->find($line['product_id']);
            if (! $product || $product->stock < $line['quantity']) {
                throw ValidationException::withMessages(['items' => 'A product is unavailable or has insufficient stock.']);
            }
        }
        DB::transaction(function () use ($request, $lines) {
            $user = User::lockForUpdate()->findOrFail($request->user()->id);
            $user->forceFill(['cart' => $lines, 'version' => $user->version + 1])->save();
        });
        $request->user()->refresh();

        return $this->cart($request, $shop);
    }

    public function checkout(Request $request, Shop $shop): array
    {
        $data = $this->validate($request, [
            'checkout_key' => 'required|uuid',
            'payment_method' => 'sometimes|string|max:80|regex:/^[a-z][a-z0-9_-]*$/D',
            'shipping_address' => 'required|array:name,line1,city,postcode,country',
            'shipping_address.name' => 'required|string|max:100',
            'shipping_address.line1' => 'required|string|max:200',
            'shipping_address.city' => 'required|string|max:100',
            'shipping_address.postcode' => 'required|string|max:20',
            'shipping_address.country' => 'required|string|in:MY',
        ]);
        $order = DB::transaction(function () use ($request, $shop, $data) {
            // Serialize checkouts for this account before checking the idempotency key.
            $user = User::lockForUpdate()->findOrFail($request->user()->id);
            $existing = Order::where('user_id', $user->id)->where('checkout_key', $data['checkout_key'])->first();
            if ($existing) {
                abort_unless($existing->shipping_address === $data['shipping_address'], 409, 'Checkout key belongs to a different request.');
                abort_if(isset($data['payment_method']) && $existing->payment_method !== $data['payment_method'], 409, 'Checkout key belongs to a different payment method.');

                return $existing;
            }
            $selection = app(PaymentProviders::class)->select($shop->slug, $data['payment_method'] ?? null);
            $driver = $selection['method'];
            $cart = $user->cart ?? [];
            if (! $cart) {
                throw ValidationException::withMessages(['cart' => 'Your cart is empty.']);
            }
            $products = Product::where('shop_id', $shop->id)->whereIn('id', array_column($cart, 'product_id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $items = [];
            $subtotal = 0;
            foreach ($cart as $line) {
                $product = $products->get($line['product_id']);
                if (! $product || ! $product->active || $product->stock < $line['quantity']) {
                    throw ValidationException::withMessages(['stock' => 'A product is unavailable or has insufficient stock. Please update your cart.']);
                }
                $items[] = ['product_id' => $product->id, 'name' => $product->name, 'price' => $product->price, 'quantity' => $line['quantity']];
                $subtotal += $product->price * $line['quantity'];
                $product->decrement('stock', $line['quantity']);
                $product->increment('version');
            }
            $order = Order::create(['shop_id' => $shop->id, 'user_id' => $user->id, 'checkout_key' => $data['checkout_key'], 'items' => $items, 'shipping_address' => $data['shipping_address'], 'subtotal' => $subtotal, 'shipping' => 800, 'total' => $subtotal + 800, 'status' => 'placed', 'payment_method' => $driver, 'currency' => 'MYR']);
            if ($driver !== 'simulated') {
                Payment::create(['public_id' => (string) Str::uuid(),
                    'order_id' => $order->id, 'status' => Payment::Queued,
                    'provider' => $selection['provider'], 'integration' => $selection['integration'],
                    'sandbox' => $driver === 'stripe' ? config('payments.stripe.sandbox') : config('payments.sandbox'),
                    'collection_id' => $driver === 'billplz' ? config('payments.collections.'.$shop->slug) : $driver]);
            }
            $user->forceFill(['cart' => [], 'version' => $user->version + 1])->save();

            return $order;
        }, 3);

        return ['order' => $order->load('payment')];
    }

    public function orders(Request $request, Shop $shop): array
    {
        $data = $this->validate($request, ['page' => 'nullable|integer|min:1', 'status' => ['nullable', Rule::in(array_keys(Order::options()))]]);
        $query = Order::where('shop_id', $shop->id)->where('user_id', $request->user()->id);
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }

        return ['orders' => PublicData::page($query->latest('id')->paginate(20, ['*'], 'page', (int) ($data['page'] ?? 1))), 'options' => Order::options(), 'transitions' => Order::transitions()];
    }
}
