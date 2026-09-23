<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use App\Support\FileUploader;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommerceTest extends TestCase
{
    use RefreshDatabase;

    private Shop $shop;

    private Shop $other;

    private User $customer;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->shop = Shop::create(['slug' => 'fashion', 'name' => 'Maison']);
        $this->other = Shop::create(['slug' => 'electronics', 'name' => 'Volt']);
        $this->customer = User::create(['shop_id' => $this->shop->id, 'name' => 'Customer', 'email' => 'customer@test.com', 'password' => 'Password123!']);
        $this->product = Product::create(['shop_id' => $this->shop->id, 'name' => 'Linen shirt', 'category' => 'Layers', 'description' => 'A good shirt', 'image_url' => 'https://example.com/shirt.jpg', 'price' => 10000, 'stock' => 3]);
    }

    private function url(string $path, string $shop = 'fashion'): string
    {
        return "/api/v1/shops/$shop/$path";
    }

    private function checkoutData(?string $key = null): array
    {
        return ['checkout_key' => $key ?? (string) Str::uuid(), 'shipping_address' => ['name' => 'Customer', 'line1' => '12 Jalan Test', 'city' => 'Melaka', 'postcode' => '75000', 'country' => 'MY']];
    }

    public function test_catalog_and_product_detail_do_not_leak_other_shops(): void
    {
        $this->getJson($this->url('products'))->assertOk()->assertJsonCount(1, 'products.data');
        $this->getJson($this->url('products', 'electronics'))->assertOk()->assertJsonCount(0, 'products.data');
        $this->getJson($this->url('products/'.$this->product->id, 'electronics'))->assertNotFound();
        $this->getJson($this->url('products?search=LINEN&category=Layers'))->assertJsonCount(1, 'products.data');
    }

    public function test_authenticated_customer_cannot_switch_shop_or_use_admin(): void
    {
        Sanctum::actingAs($this->customer);
        $this->getJson($this->url('cart', 'electronics'))->assertForbidden();
        $this->getJson($this->url('orders', 'electronics'))->assertForbidden();
        $this->getJson($this->url('admin/products'))->assertForbidden();
        $this->postJson($this->url('admin/products'), [])->assertForbidden();
    }

    public function test_cart_rejects_cross_shop_duplicate_and_excessive_items(): void
    {
        Sanctum::actingAs($this->customer);
        $foreign = Product::create(['shop_id' => $this->other->id, 'name' => 'Speaker', 'category' => 'Audio', 'description' => 'Sound', 'image_url' => 'https://example.com/speaker.jpg', 'price' => 5000, 'stock' => 8]);
        $this->putJson($this->url('cart'), ['items' => [['product_id' => $foreign->id, 'quantity' => 1]]])->assertUnprocessable();
        $this->putJson($this->url('cart'), ['items' => [['product_id' => $this->product->id, 'quantity' => 4]]])->assertUnprocessable();
        $this->putJson($this->url('cart'), ['items' => array_fill(0, 2, ['product_id' => $this->product->id, 'quantity' => 1])])->assertUnprocessable();
        $this->putJson($this->url('cart'), ['items' => []])->assertOk();
    }

    public function test_checkout_is_server_priced_and_idempotent(): void
    {
        Sanctum::actingAs($this->customer);
        $this->putJson($this->url('cart'), ['items' => [['product_id' => $this->product->id, 'quantity' => 2, 'price' => 1]]])->assertOk();
        $data = [...$this->checkoutData(), 'total' => 1, 'shipping' => 0];
        $first = $this->postJson($this->url('checkout'), $data)->assertOk()->assertJsonPath('order.total', 20800);
        $this->postJson($this->url('checkout'), $data)->assertOk()->assertJsonPath('order.id', $first->json('order.id'));
        $this->assertDatabaseCount('orders', 1);
        $this->assertSame(1, $this->product->fresh()->stock);
        $this->assertSame([], $this->customer->fresh()->cart);
    }

    public function test_stock_change_rolls_back_checkout_and_keeps_cart(): void
    {
        Sanctum::actingAs($this->customer);
        $this->putJson($this->url('cart'), ['items' => [['product_id' => $this->product->id, 'quantity' => 3]]])->assertOk();
        $this->product->update(['stock' => 1]);
        $this->postJson($this->url('checkout'), $this->checkoutData())->assertUnprocessable();
        $this->assertDatabaseCount('orders', 0);
        $this->assertSame(1, $this->product->fresh()->stock);
        $this->assertNotEmpty($this->customer->fresh()->cart);
    }

    public function test_empty_cart_and_invalid_address_are_rejected(): void
    {
        Sanctum::actingAs($this->customer);
        $this->postJson($this->url('checkout'), $this->checkoutData())->assertUnprocessable();
        $this->postJson($this->url('checkout'), ['checkout_key' => 'bad'])->assertUnprocessable();
    }

    public function test_customer_sees_only_own_orders(): void
    {
        Sanctum::actingAs($this->customer);
        $this->customer->update(['cart' => [['product_id' => $this->product->id, 'quantity' => 1]]]);
        $this->postJson($this->url('checkout'), $this->checkoutData())->assertOk();
        $this->getJson($this->url('orders'))->assertJsonCount(1, 'orders.data');
        $another = User::create(['shop_id' => $this->shop->id, 'name' => 'Other', 'email' => 'other@test.com', 'password' => 'Password123!']);
        Sanctum::actingAs($another);
        $this->getJson($this->url('orders'))->assertJsonCount(0, 'orders.data');
    }

    public function test_admin_cannot_reassign_product_and_order_status_is_sequential(): void
    {
        $this->customer->update(['role' => 'admin', 'cart' => [['product_id' => $this->product->id, 'quantity' => 1]]]);
        Sanctum::actingAs($this->customer);
        $this->patchJson($this->url('admin/products/'.$this->product->id), ['shop_id' => $this->other->id, 'price' => 20000])->assertOk()->assertJsonPath('product.shop_id', $this->shop->id);
        $this->patchJson($this->url('admin/products/'.$this->product->id, 'electronics'), ['price' => 1])->assertForbidden();
        $order = $this->postJson($this->url('checkout'), $this->checkoutData())->assertOk()->json('order.id');
        $this->patchJson($this->url("admin/orders/$order"), ['status' => 'shipped'])->assertUnprocessable();
        foreach (['processing', 'shipped', 'completed'] as $status) {
            $this->patchJson($this->url("admin/orders/$order"), ['status' => $status])->assertOk()->assertJsonPath('order.status', $status);
        }
        $this->patchJson($this->url("admin/orders/$order"), ['status' => 'processing'])->assertUnprocessable();
    }

    public function test_registration_ignores_role_and_email_is_unique_per_shop(): void
    {
        $data = ['name' => 'New', 'email' => 'NEW@test.com', 'password' => 'Password123!', 'password_confirmation' => 'Password123!', 'device_name' => 'test', 'role' => 'admin', 'shop_id' => $this->other->id];
        $this->postJson($this->url('auth/register'), $data)->assertOk()->assertJsonPath('user.role', 'customer')->assertJsonPath('user.shop_id', $this->shop->id)->assertJsonStructure(['token']);
        $this->postJson($this->url('auth/register'), $data)->assertUnprocessable();
        $this->postJson($this->url('auth/register', 'electronics'), $data)->assertOk();
    }

    public function test_native_login_token_is_scoped_to_account_shop(): void
    {
        $data = ['email' => $this->customer->email, 'password' => 'Password123!', 'device_name' => 'Android'];
        $this->postJson($this->url('auth/login', 'electronics'), $data)->assertUnprocessable();
        $token = $this->postJson($this->url('auth/login'), $data)->assertOk()->json('token');
        $this->withToken($token)->getJson($this->url('auth/me'))->assertOk();
        $this->withToken($token)->getJson($this->url('auth/me', 'electronics'))->assertForbidden();
    }

    public function test_admin_crud_is_paginated_filtered_versioned_and_soft_deleted(): void
    {
        $this->customer->update(['role' => 'admin']);
        Sanctum::actingAs($this->customer);
        $data = ['name' => 'Test coat', 'category' => 'Coats', 'description' => 'A coat', 'image_url' => 'https://example.com/coat.png', 'price' => 12345, 'stock' => 2, 'active' => true];
        $created = $this->postJson($this->url('admin/products'), $data)->assertOk()->json('product');
        $this->assertNotEmpty($created['code']);
        $this->getJson($this->url('admin/products?category=Coats'))->assertOk()->assertJsonCount(1, 'products.data')->assertJsonPath('products.meta.total', 1)->assertJsonPath('options.1', 'Published');
        $this->getJson($this->url('admin/products/'.$created['id']))->assertOk()->assertJsonPath('product.version', 0)->assertJsonMissingPath('product.deleted_at');
        $this->patchJson($this->url('admin/products/'.$created['id']), ['stock' => 4])->assertOk()->assertJsonPath('product.version', 1);
        $this->deleteJson($this->url('admin/products/'.$created['id']))->assertOk()->assertJsonPath('deleted', true);
        $this->assertSoftDeleted('products', ['id' => $created['id']]);
        $this->getJson($this->url('admin/products/'.$created['id']))->assertNotFound();
        $this->getJson($this->url('admin/orders?status=placed'))->assertOk()->assertJsonPath('orders.meta.total', 0);
        $this->postJson($this->url('admin/products'), [...$data, 'price' => true])->assertUnprocessable()->assertJsonStructure(['validation_error' => ['price']]);
    }

    public function test_strict_cart_payloads_cannot_change_state(): void
    {
        Sanctum::actingAs($this->customer);
        foreach ([true, '1', 1.5, -1, 0, 100, null] as $quantity) {
            $this->putJson($this->url('cart'), ['items' => [['product_id' => $this->product->id, 'quantity' => $quantity]]])->assertUnprocessable();
        }
        $this->assertSame(0, $this->customer->fresh()->version);
        $this->putJson($this->url('cart'), ['items' => [], 'expected_version' => '0'])->assertUnprocessable();
    }

    public function test_upload_whitelist_transaction_and_filename_contract(): void
    {
        Storage::fake('public');
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=');
        $file = UploadedFile::fake()->createWithContent('photo.png', $png);
        $model = FileUploader::createWithUpload(function () {
            $copy = $this->product->replicate();
            $copy->code = (string) Str::uuid();
            $copy->save();

            return $copy;
        }, $file, 'image_url');
        $this->assertMatchesRegularExpression('~^images/'.$model->id.'_[a-f0-9]+\.png$~', $model->image_url);
        Storage::disk('public')->assertExists($model->image_url);
        try {
            DB::transaction(fn () => FileUploader::store($this->product, UploadedFile::fake()->createWithContent('bad.php', '<?php echo 1;')));
            $this->fail('Executable upload should be rejected');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('file', $error->errors());
        }
        $this->expectException(\LogicException::class);
        FileUploader::store(new Product, $file);
    }
}
