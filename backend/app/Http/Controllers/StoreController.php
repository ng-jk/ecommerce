<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StoreController extends Controller
{
    public function products(Request $request, Shop $shop): array
    {
        $data = $request->validate(['search' => 'nullable|string|max:100', 'category' => 'nullable|string|max:80', 'page' => 'nullable|integer|min:1']);
        $query = Product::where('shop_id', $shop->id)->where('active', true);
        $categories = (clone $query)->distinct()->orderBy('category')->pluck('category');
        if (! empty($data['search'])) {
            $query->whereRaw('LOWER(name) LIKE ?', ['%'.strtolower($data['search']).'%']);
        }
        if (! empty($data['category'])) {
            $query->where('category', $data['category']);
        }

        return ['shop' => $shop, 'categories' => $categories, 'products' => $query->orderBy('id')->paginate(24)];
    }

    public function product(Shop $shop, int $id): array
    {
        return ['product' => Product::where('shop_id', $shop->id)->where('active', true)->findOrFail($id)];
    }

    public function cart(Request $request, Shop $shop): array
    {
        $lines = $request->user()->cart ?? [];
        $products = Product::where('shop_id', $shop->id)->whereIn('id', array_column($lines, 'product_id'))->get()->keyBy('id');

        return ['items' => array_map(fn ($line) => [...$line, 'product' => $products->get($line['product_id'])], $lines)];
    }

    public function updateCart(Request $request, Shop $shop): array
    {
        $data = $request->validate(['items' => 'present|array|max:50', 'items.*.product_id' => 'required|integer|distinct', 'items.*.quantity' => 'required|integer|min:1|max:99']);
        $lines = array_map(fn ($line) => ['product_id' => $line['product_id'], 'quantity' => $line['quantity']], $data['items']);
        foreach ($lines as $line) {
            $product = Product::where('shop_id', $shop->id)->where('active', true)->find($line['product_id']);
            if (! $product || $product->stock < $line['quantity']) {
                throw ValidationException::withMessages(['items' => 'A product is unavailable or has insufficient stock.']);
            }
        }
        DB::transaction(function () use ($request, $lines) {
            $user = User::lockForUpdate()->findOrFail($request->user()->id);
            $user->update(['cart' => $lines]);
        });
        $request->user()->refresh();

        return $this->cart($request, $shop);
    }

    public function checkout(Request $request, Shop $shop): array
    {
        $data = $request->validate([
            'checkout_key' => 'required|uuid',
            'shipping_address' => 'required|array:name,line1,city,postcode,country',
            'shipping_address.name' => 'required|string|max:100',
            'shipping_address.line1' => 'required|string|max:200',
            'shipping_address.city' => 'required|string|max:100',
            'shipping_address.postcode' => 'required|string|max:20',
            'shipping_address.country' => 'required|in:MY',
        ]);
        $order = DB::transaction(function () use ($request, $shop, $data) {
            // Serialize checkouts for this account before checking the idempotency key.
            $user = User::lockForUpdate()->findOrFail($request->user()->id);
            $existing = Order::where('user_id', $user->id)->where('checkout_key', $data['checkout_key'])->first();
            if ($existing) {
                return $existing;
            }
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
            }
            $order = Order::create(['shop_id' => $shop->id, 'user_id' => $user->id, 'checkout_key' => $data['checkout_key'], 'items' => $items, 'shipping_address' => $data['shipping_address'], 'subtotal' => $subtotal, 'shipping' => 800, 'total' => $subtotal + 800, 'status' => 'placed', 'payment_method' => 'simulated', 'currency' => 'MYR']);
            $user->update(['cart' => []]);

            return $order;
        }, 3);

        return ['order' => $order];
    }

    public function orders(Request $request, Shop $shop): array
    {
        return ['orders' => Order::where('shop_id', $shop->id)->where('user_id', $request->user()->id)->latest('id')->paginate(20)];
    }
}
