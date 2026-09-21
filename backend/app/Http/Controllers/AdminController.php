<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\Shop;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->role === 'admin', 403);
    }

    public function products(Request $request, Shop $shop): array
    {
        $this->authorizeAdmin($request);

        return ['products' => Product::where('shop_id', $shop->id)->orderBy('id')->paginate(24)];
    }

    private function productData(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "$required|string|max:150", 'category' => "$required|string|max:80",
            'description' => "$required|string|max:5000", 'image_url' => "$required|url:https|max:2048",
            'price' => "$required|integer|min:1|max:10000000", 'stock' => "$required|integer|min:0|max:1000000",
            'active' => 'sometimes|boolean', 'specifications' => 'nullable|array|max:20', 'specifications.*' => 'string|max:300',
        ]);
    }

    public function createProduct(Request $request, Shop $shop): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['product' => Product::create([...$this->productData($request), 'shop_id' => $shop->id])], 201);
    }

    public function updateProduct(Request $request, Shop $shop, int $id): array
    {
        $product = Product::where('shop_id', $shop->id)->findOrFail($id);
        Gate::authorize('update', $product);
        $product->update($this->productData($request, true));

        return ['product' => $product->refresh()];
    }

    public function orders(Request $request, Shop $shop): array
    {
        $this->authorizeAdmin($request);

        return ['orders' => Order::where('shop_id', $shop->id)->latest('id')->paginate(20)];
    }

    public function updateOrder(Request $request, Shop $shop, int $id): array
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['status' => ['required', Rule::in(['processing', 'shipped', 'completed'])]]);
        $order = DB::transaction(function () use ($shop, $id, $data) {
            $order = Order::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($id);
            $next = ['placed' => 'processing', 'processing' => 'shipped', 'shipped' => 'completed'];
            abort_unless(($next[$order->status] ?? null) === $data['status'], 422, 'Orders must advance one stage at a time.');
            $order->update($data);

            return $order;
        });

        return ['order' => $order];
    }
}
