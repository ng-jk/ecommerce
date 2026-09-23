<?php

namespace App\Domain;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Models\Shop;
use App\Support\PublicData;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminActions extends Controller
{
    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'admin', 403);
    }

    public function products(Request $request, Shop $shop): array
    {
        $this->authorizeAdmin($request);

        $data = $this->validate($request, ['page' => 'nullable|integer|min:1', 'category' => 'nullable|string|max:80']);
        $query = Product::where('shop_id', $shop->id);
        if (! empty($data['category'])) {
            $query->where('category', $data['category']);
        }

        return ['products' => PublicData::page($query->orderBy('id')->paginate(24, ['*'], 'page', (int) ($data['page'] ?? 1))), 'options' => Product::options()];
    }

    public function product(Request $request, Shop $shop, int $id): array
    {
        $this->authorizeAdmin($request);

        return ['product' => Product::where('shop_id', $shop->id)->findOrFail($id), 'options' => Product::options()];
    }

    public function deleteProduct(Request $request, Shop $shop, int $id): array
    {
        $this->authorizeAdmin($request);
        $product = Product::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($id);
        $product->delete();

        return ['deleted' => true];
    }

    private function productData(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $this->validate($request, [
            'name' => "$required|string|max:150", 'category' => "$required|string|max:80",
            'description' => "$required|string|max:5000", 'image_url' => "$required|url:https|max:2048",
            'price' => "$required|integer:strict|min:1|max:10000000", 'stock' => "$required|integer:strict|min:0|max:1000000",
            'active' => 'sometimes|boolean:strict', 'specifications' => 'nullable|array|max:20', 'specifications.*' => 'string|max:300',
        ]);
    }

    public function createProduct(Request $request, Shop $shop): array
    {
        $this->authorizeAdmin($request);

        return DB::transaction(fn () => ['product' => Product::create([...$this->productData($request), 'shop_id' => $shop->id])]);
    }

    public function updateProduct(Request $request, Shop $shop, int $id): array
    {
        $product = Product::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($id);
        Gate::authorize('update', $product);
        $product->update($this->productData($request, true));
        $product->increment('version');

        return ['product' => $product->refresh()];
    }

    public function orders(Request $request, Shop $shop): array
    {
        $this->authorizeAdmin($request);

        $data = $this->validate($request, ['page' => 'nullable|integer|min:1', 'status' => ['nullable', Rule::in(array_keys(Order::options()))]]);
        $query = Order::where('shop_id', $shop->id);
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }

        return ['orders' => PublicData::page($query->latest('id')->paginate(20, ['*'], 'page', (int) ($data['page'] ?? 1))), 'options' => Order::options(), 'transitions' => Order::transitions()];
    }

    public function updateOrder(Request $request, Shop $shop, int $id): array
    {
        $this->authorizeAdmin($request);
        $data = $this->validate($request, ['status' => ['required', Rule::in(array_values(Order::transitions()))]]);
        $order = DB::transaction(function () use ($shop, $id, $data) {
            $order = Order::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($id);
            $next = Order::transitions();
            if (($next[$order->status] ?? null) !== $data['status']) {
                throw ValidationException::withMessages(['status' => 'Orders must advance one stage at a time.']);
            }
            $order->update($data);
            $order->increment('version');

            return $order;
        });

        return ['order' => $order];
    }
}
