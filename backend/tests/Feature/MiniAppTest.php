<?php

namespace Tests\Feature;

use App\Domain\MiniAppArchive;
use App\Domain\OperationProcessor;
use App\Models\MiniAppInstallation;
use App\Models\MiniAppPackage;
use App\Models\MiniAppVersion;
use App\Models\Operation;
use App\Models\PluginInstallation;
use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use App\Support\FileUploader;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;
use ZipArchive;

class MiniAppTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    private function archive(array $files = []): string
    {
        $path = tempnam(sys_get_temp_dir(), 'miniapp');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::OVERWRITE);
        foreach ($files + ['manifest.json' => json_encode(['id' => 'sample-app', 'name' => 'Sample App', 'version' => '1.0.0', 'entry' => 'index.html', 'capabilities' => ['catalog', 'product']]), 'index.html' => '<!doctype html><script src="app.js"></script>', 'app.js' => 'window.parent.postMessage("hello", "*")'] as $name => $contents) {
            $zip->addFromString($name, $contents);
        }
        $zip->close();

        return $path;
    }

    private function operate(string $method, string $path, array $body = []): Operation
    {
        $actor = auth('sanctum')->user();
        $accepted = $this->json($method, '/api/v1/shops/fashion/'.$path, $body)->assertAccepted();
        app(OperationProcessor::class)->processNext();
        if ($actor) {
            Sanctum::actingAs($actor->fresh());
        }

        return Operation::where('public_id', $accepted->json('operation_id'))->firstOrFail();
    }

    public function test_import_requires_explicit_approval_and_rejected_duplicate_keeps_assets(): void
    {
        Storage::fake('local');
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $admin = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Admin]);
        $path = $this->archive();
        try {
            $version = app(MiniAppArchive::class)->import($path, 'public', null);
            $asset = 'miniapps/assets/'.$version->digest.'/index.html';
            $this->assertTrue(Storage::disk('local')->exists($asset));
            config()->set('miniapps.approver_user_ids', []);
            $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $admin->id])->assertExitCode(1);
            $this->assertNull($version->fresh()->approved_at);
            config()->set('miniapps.approver_user_ids', [$admin->id]);
            $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $admin->id])->assertExitCode(0);
            $this->expectException(ValidationException::class);
            try {
                app(MiniAppArchive::class)->import($path, 'public', null);
            } finally {
                $this->assertTrue(Storage::disk('local')->exists($asset));
                $this->assertNotNull($version->fresh()->approved_at);
            }
        } finally {
            unlink($path);
        }
    }

    public function test_invalid_archive_paths_and_manifest_are_rejected(): void
    {
        Storage::fake('local');
        foreach ([['../index.html' => 'bad'], ['manifest.json' => '{}'], ['index.html' => 'duplicate', 'INDEX.html' => 'duplicate'], ['icon.png' => 'not a PNG'], ['manifest.json' => json_encode(['id' => 'sample-app', 'name' => 'Sample App', 'version' => '1.0.0', 'entry' => 'index.html', 'capabilities' => [['catalog']]])]] as $override) {
            $path = $this->archive($override);
            try {
                $this->assertThrows(fn () => app(MiniAppArchive::class)->import($path, 'public', null), ValidationException::class);
            } finally {
                unlink($path);
            }
        }
    }

    public function test_private_distribution_and_operator_import_command(): void
    {
        Storage::fake('local');
        $owner = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $other = Shop::create(['slug' => 'other', 'name' => 'Other']);
        $operator = User::factory()->create(['shop_id' => $owner->id]);
        $ownerAdmin = User::factory()->create(['shop_id' => $owner->id, 'role' => User::Admin]);
        $otherAdmin = User::factory()->create(['shop_id' => $other->id, 'role' => User::Admin]);
        $path = $this->archive();
        try {
            $this->artisan('miniapps:import', ['archive' => $path, '--visibility' => 'private', '--shop' => 'fashion'])->assertExitCode(0);
        } finally {
            unlink($path);
        }
        $version = MiniAppVersion::firstOrFail();
        config()->set('miniapps.approver_user_ids', [$operator->id]);
        $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $operator->id])->assertExitCode(0);
        Sanctum::actingAs($otherAdmin);
        $this->getJson('/api/v1/shops/other/admin/miniapps')->assertAccepted();
        app(OperationProcessor::class)->processNext();
        Sanctum::actingAs($ownerAdmin);
        $this->assertSame(200, $this->operate('POST', 'admin/miniapps', ['package_id' => $version->package_id, 'grants' => []])->http_status);
        Sanctum::actingAs($otherAdmin->fresh());
        $accepted = $this->json('POST', '/api/v1/shops/other/admin/miniapps', ['package_id' => $version->package_id])->assertAccepted();
        app(OperationProcessor::class)->processNext();
        $this->assertSame(404, Operation::where('public_id', $accepted->json('operation_id'))->firstOrFail()->http_status);
    }

    public function test_operator_rejects_inactive_approver_and_tampered_release(): void
    {
        Storage::fake('local');
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $operator = User::factory()->create(['shop_id' => $shop->id]);
        config()->set('miniapps.approver_user_ids', [$operator->id]);
        $path = $this->archive();
        try {
            $version = app(MiniAppArchive::class)->import($path, 'public', null);
        } finally {
            unlink($path);
        }
        $this->artisan('miniapps:revoke', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => 999])->assertExitCode(1);
        $operator->forceFill(['account_status' => 'disabled'])->save();
        $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $operator->id])->assertExitCode(1);
        $operator->forceFill(['account_status' => 'active'])->save();
        $original = Storage::disk('local')->get($version->archive_path);
        Storage::disk('local')->put($version->archive_path, 'tampered');
        $this->assertThrows(fn () => $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $operator->id]), \RuntimeException::class);
        Storage::disk('local')->put($version->archive_path, $original);
        $assetPath = 'miniapps/assets/'.$version->digest.'/index.html';
        $asset = Storage::disk('local')->get($assetPath);
        Storage::disk('local')->put($assetPath, 'tampered');
        $this->assertThrows(fn () => $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $operator->id]), \RuntimeException::class);
        Storage::disk('local')->put($assetPath, $asset);
        $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $operator->id])->assertExitCode(0);
        $this->assertThrows(fn () => $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $operator->id]), \RuntimeException::class);
    }

    public function test_archive_rejects_invalid_container_and_content_limits(): void
    {
        Storage::fake('local');
        $empty = tempnam(sys_get_temp_dir(), 'miniapp');
        $this->assertThrows(fn () => app(MiniAppArchive::class)->import($empty, 'public', null), ValidationException::class);
        file_put_contents($empty, 'not a zip');
        $this->assertThrows(fn () => app(MiniAppArchive::class)->import($empty, 'public', null), ValidationException::class);
        unlink($empty);
        $valid = $this->archive();
        try {
            $this->assertThrows(fn () => app(MiniAppArchive::class)->import($valid, 'private', null), ValidationException::class);
        } finally {
            unlink($valid);
        }
        foreach ([['only.js' => 'x'], ['index.html' => '<html></html>', 'app.js' => 'x'], ['bad.js' => "\0"], ['bad.json' => '{invalid'], ['large.js' => str_repeat('A', 2 * 1024 * 1024 + 1)]] as $files) {
            $path = tempnam(sys_get_temp_dir(), 'miniapp');
            $zip = new ZipArchive;
            $zip->open($path, ZipArchive::OVERWRITE);
            foreach ($files as $name => $bytes) {
                $zip->addFromString($name, $bytes);
            }
            $zip->close();
            try {
                $this->assertThrows(fn () => app(MiniAppArchive::class)->import($path, 'public', null), ValidationException::class);
            } finally {
                unlink($path);
            }
        }
        $path = $this->archive();
        $zip = new ZipArchive;
        $zip->open($path);
        $zip->setExternalAttributesName('app.js', ZipArchive::OPSYS_UNIX, 0120000 << 16);
        $zip->close();
        try {
            $this->assertThrows(fn () => app(MiniAppArchive::class)->import($path, 'public', null), ValidationException::class);
        } finally {
            unlink($path);
        }
        foreach ([['bad.js' => "\0"], ['bad.json' => '{invalid'], ['large.js' => str_repeat('A', 2 * 1024 * 1024 + 1)]] as $override) {
            $path = $this->archive($override);
            try {
                $this->assertThrows(fn () => app(MiniAppArchive::class)->import($path, 'public', null), ValidationException::class);
            } finally {
                unlink($path);
            }
        }
    }

    public function test_archive_rejects_damaged_entry_and_ownership_change(): void
    {
        Storage::fake('local');
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $first = $this->archive();
        try {
            app(MiniAppArchive::class)->import($first, 'private', $shop);
        } finally {
            unlink($first);
        }
        $second = $this->archive(['manifest.json' => json_encode(['id' => 'sample-app', 'name' => 'Sample App', 'version' => '1.1.0', 'entry' => 'index.html', 'capabilities' => ['catalog']])]);
        try {
            $this->assertThrows(fn () => app(MiniAppArchive::class)->import($second, 'public', null), ValidationException::class);
        } finally {
            unlink($second);
        }
        $damaged = $this->archive(['manifest.json' => json_encode(['id' => 'broken-app', 'name' => 'Broken App', 'version' => '1.0.0', 'entry' => 'index.html', 'capabilities' => ['catalog']]), 'app.js' => 'UNIQUE_STORED_BYTES']);
        $zip = new ZipArchive;
        $zip->open($damaged);
        $zip->setCompressionName('app.js', ZipArchive::CM_STORE);
        $zip->close();
        $bytes = file_get_contents($damaged);
        $this->assertStringContainsString('UNIQUE_STORED_BYTES', $bytes);
        file_put_contents($damaged, str_replace('UNIQUE_STORED_BYTES', 'DAMAGED_STORED_DATA', $bytes));
        try {
            $this->assertThrows(fn () => app(MiniAppArchive::class)->import($damaged, 'public', null), ValidationException::class);
        } finally {
            unlink($damaged);
        }
    }

    public function test_failed_asset_store_cleans_new_archive_and_asset_prefix(): void
    {
        Storage::fake('local');
        $realDisk = Storage::disk('local');
        $failingDisk = Mockery::mock($realDisk)->makePartial();
        $failingDisk->shouldReceive('put')->andReturnUsing(function (string $path, $contents) use ($realDisk): bool {
            return str_starts_with($path, 'miniapps/assets/') ? false : $realDisk->put($path, $contents);
        });
        Storage::shouldReceive('disk')->with('local')->andReturn($failingDisk);
        $path = $this->archive();
        try {
            $this->assertThrows(fn () => app(MiniAppArchive::class)->import($path, 'public', null), \RuntimeException::class);
            $this->assertSame([], $realDisk->allFiles('miniapps'));
        } finally {
            unlink($path);
        }
    }

    public function test_archive_uploader_enforces_transaction_and_content(): void
    {
        Storage::fake('local');
        $model = new MiniAppVersion;
        $model->id = 123;
        $path = $this->archive();
        try {
            $this->assertThrows(fn () => FileUploader::storeMiniAppArchive($model, $path), \LogicException::class);
            $model->exists = true;
            $this->assertThrows(fn () => DB::transaction(fn () => FileUploader::storeMiniAppArchive($model, $path.'.missing')), \RuntimeException::class);
            $invalid = tempnam(sys_get_temp_dir(), 'miniapp');
            file_put_contents($invalid, 'not zip');
            try {
                $this->assertThrows(fn () => DB::transaction(fn () => FileUploader::storeMiniAppArchive($model, $invalid)), ValidationException::class);
            } finally {
                unlink($invalid);
            }
        } finally {
            unlink($path);
        }
    }

    public function test_archive_uploader_bounds_collisions_and_write_failures(): void
    {
        Storage::fake('local');
        $realDisk = Storage::disk('local');
        $disk = Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('exists')->andReturn(true);
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);
        $model = new MiniAppVersion;
        $model->id = 123;
        $model->exists = true;
        $path = $this->archive();
        try {
            $this->assertThrows(fn () => DB::transaction(fn () => FileUploader::storeMiniAppArchive($model, $path)), \RuntimeException::class);
        } finally {
            unlink($path);
        }
    }

    public function test_archive_uploader_reports_failed_private_storage_write(): void
    {
        Storage::fake('local');
        $realDisk = Storage::disk('local');
        $disk = Mockery::mock($realDisk)->makePartial();
        $disk->shouldReceive('exists')->andReturn(false);
        $disk->shouldReceive('put')->andReturn(false);
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);
        $model = new MiniAppVersion;
        $model->id = 123;
        $model->exists = true;
        $path = $this->archive();
        try {
            $this->assertThrows(fn () => DB::transaction(fn () => FileUploader::storeMiniAppArchive($model, $path)), \RuntimeException::class);
        } finally {
            unlink($path);
        }
    }

    public function test_assets_only_serve_approved_bytes_on_isolated_origin(): void
    {
        Storage::fake('local');
        config()->set('miniapps.asset_origin', 'http://miniapps.test');
        config()->set('miniapps.parent_origins', ['http://shop.test']);
        config()->set('app.url', 'http://api.test');
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $operator = User::factory()->create(['shop_id' => $shop->id]);
        $path = $this->archive();
        try {
            $version = app(MiniAppArchive::class)->import($path, 'public', null);
        } finally {
            unlink($path);
        }
        $url = '/miniapp-assets/'.$version->digest.'/index.html';
        $this->get('http://miniapps.test'.$url)->assertNotFound();
        config()->set('miniapps.approver_user_ids', [$operator->id]);
        $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $operator->id])->assertExitCode(0);
        $asset = $this->get('http://miniapps.test'.$url)->assertOk();
        $this->assertFalse($asset->headers->has('Set-Cookie'));
        $this->assertStringStartsWith('text/html', $asset->headers->get('Content-Type'));
        $this->assertStringContainsString('sandbox allow-scripts', $asset->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString('script-src http://miniapps.test/miniapp-assets/'.$version->digest.'/', $asset->headers->get('Content-Security-Policy'));
        $this->get('http://miniapps.test/api/v1/shops/fashion/products')->assertNotFound();
        $this->get('http://api.test'.$url)->assertNotFound();
        Storage::disk('local')->put('miniapps/assets/'.$version->digest.'/index.html', '<script>tampered</script>');
        $this->get('http://miniapps.test'.$url)->assertNotFound();
        Storage::disk('local')->put('miniapps/assets/'.$version->digest.'/index.html', '<!doctype html><script src="app.js"></script>');
        $this->withHeaders(['Cookie' => 'session=secret'])->get('http://miniapps.test'.$url)->assertNotFound();
        $this->flushHeaders();
        $this->withHeaders(['Authorization' => 'Bearer secret'])->get('http://miniapps.test'.$url)->assertNotFound();
    }

    public function test_worker_checks_shop_grants_generation_and_approval(): void
    {
        Storage::fake('local');
        config()->set('miniapps.asset_origin', 'http://miniapps.test');
        config()->set('app.url', 'http://api.test');
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $other = Shop::create(['slug' => 'other', 'name' => 'Other']);
        $admin = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Admin]);
        $customer = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Customer]);
        $stranger = User::factory()->create(['shop_id' => $other->id, 'role' => User::Customer]);
        $path = $this->archive();
        try {
            $version = app(MiniAppArchive::class)->import($path, 'public', null);
        } finally {
            unlink($path);
        }
        Sanctum::actingAs($admin);
        $this->assertSame(404, $this->operate('POST', 'admin/miniapps', ['package_id' => $version->package_id, 'enabled' => true])->http_status);
        config()->set('miniapps.approver_user_ids', [$admin->id]);
        $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $admin->id])->assertExitCode(0);
        $install = $this->operate('POST', 'admin/miniapps', ['package_id' => $version->package_id, 'enabled' => true, 'grants' => ['catalog']]);
        $this->assertSame(200, $install->http_status);
        $id = $install->result['miniapp']['id'];
        Sanctum::actingAs($customer);
        $launch = $this->operate('POST', "miniapps/$id/launch");
        $this->assertSame(200, $launch->http_status);
        $launchId = $launch->result['launch']['id'];
        $this->assertSame(403, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'product', 'input' => ['id' => 1]])->http_status);
        $catalog = $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'catalog', 'input' => []]);
        $this->assertSame(200, $catalog->http_status);
        $this->assertArrayHasKey('products', $catalog->result['response']);
        Sanctum::actingAs($stranger);
        $this->getJson('/api/v1/shops/fashion/miniapps')->assertForbidden();
        Sanctum::actingAs($admin->fresh());
        $this->assertSame(200, $this->operate('PATCH', "admin/miniapps/$id", ['expected_version' => 0, 'enabled' => true, 'grants' => ['catalog', 'product']])->http_status);
        Sanctum::actingAs($customer->fresh());
        $this->assertSame(403, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'catalog', 'input' => []])->http_status);
        $queued = $this->json('POST', "/api/v1/shops/fashion/miniapps/$id/launch")->assertAccepted()->json('operation_id');
        MiniAppInstallation::whereKey($id)->update(['enabled' => false, 'version' => 2]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(404, Operation::where('public_id', $queued)->firstOrFail()->http_status);
        $this->artisan('miniapps:revoke', ['package' => 'sample-app', 'version' => '1.0.0', '--approver-id' => $admin->id])->assertExitCode(0);
        $this->assertNull(MiniAppVersion::findOrFail($version->id)->approved_at);
    }

    public function test_admin_catalog_upgrade_and_read_capability_projection(): void
    {
        Storage::fake('local');
        config()->set('miniapps.asset_origin', 'http://miniapps.test');
        config()->set('app.url', 'http://api.test');
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $admin = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Admin]);
        $customer = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Customer]);
        $product = Product::create(['shop_id' => $shop->id, 'name' => 'Bag', 'category' => 'Accessories', 'description' => 'Cotton', 'image_url' => '', 'price' => 100, 'stock' => 5, 'specifications' => []]);
        foreach (['1.0.0', '1.1.0'] as $release) {
            $path = $this->archive(['manifest.json' => json_encode(['id' => 'sample-app', 'name' => 'Sample App', 'version' => $release, 'entry' => 'index.html', 'capabilities' => ['catalog', 'product', 'cart.read', 'orders']])]);
            try {
                app(MiniAppArchive::class)->import($path, 'public', null);
            } finally {
                unlink($path);
            }
        }
        config()->set('miniapps.approver_user_ids', [$admin->id]);
        foreach (['1.0.0', '1.1.0'] as $release) {
            $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => $release, '--approver-id' => $admin->id])->assertExitCode(0);
        }
        Sanctum::actingAs($admin);
        $catalog = $this->operate('GET', 'admin/miniapps?per_page=1&enabled=false');
        $this->assertSame(200, $catalog->http_status);
        $this->assertCount(2, $catalog->result['catalog']['data'][0]['versions']);
        $this->assertSame(422, $this->operate('GET', 'admin/miniapps?per_page=51')->http_status);
        $this->assertSame(422, $this->operate('GET', 'admin/miniapps?intruder=1')->http_status);
        $packageId = $catalog->result['catalog']['data'][0]['package_id'];
        $bad = $this->operate('POST', 'admin/miniapps', ['package_id' => $packageId, 'version' => '1.0.0', 'grants' => ['checkout']]);
        $this->assertSame(422, $bad->http_status);
        $installed = $this->operate('POST', 'admin/miniapps', ['package_id' => $packageId, 'version' => '1.0.0', 'enabled' => true, 'grants' => ['catalog', 'product', 'cart.read', 'orders']]);
        $id = $installed->result['miniapp']['id'];
        $this->assertSame('1.0.0', $installed->result['miniapp']['version']);
        $this->assertSame(409, $this->operate('POST', 'admin/miniapps', ['package_id' => $packageId])->http_status);
        $this->assertSame(409, $this->operate('PATCH', "admin/miniapps/$id", ['expected_version' => 4])->http_status);
        $updated = $this->operate('PATCH', "admin/miniapps/$id", ['expected_version' => 0, 'version' => '1.1.0']);
        $this->assertSame('1.1.0', $updated->result['miniapp']['version']);
        Sanctum::actingAs($customer);
        $listed = $this->operate('GET', 'miniapps?per_page=1');
        $this->assertSame(1, $listed->result['miniapps']['meta']['total']);
        $launch = $this->operate('POST', "miniapps/$id/launch");
        $launchId = $launch->result['launch']['id'];
        $catalogRead = $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'catalog', 'input' => []]);
        $this->assertSame('Bag', $catalogRead->result['response']['products']['data'][0]['name']);
        $productRead = $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'product', 'input' => ['id' => $product->id]]);
        $this->assertSame('Bag', $productRead->result['response']['product']['name']);
        $this->assertSame(422, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'product', 'input' => ['id' => 'bad']])->http_status);
        $this->assertSame(422, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'catalog', 'input' => ['page' => -1]])->http_status);
        $this->assertArrayNotHasKey('shop_id', $productRead->result['response']['product']);
        $this->assertSame(200, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'cart.read', 'input' => []])->http_status);
        $orders = $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'orders', 'input' => []]);
        $this->assertSame([], $orders->result['response']['orders']['data']);
        $this->assertSame(422, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'orders', 'input' => ['url' => 'https://example.com']])->http_status);
        $this->artisan('miniapps:revoke', ['package' => 'sample-app', 'version' => '1.1.0', '--approver-id' => $admin->id])->assertExitCode(0);
        $this->assertSame(403, $this->operate('POST', "miniapps/$id/launch")->http_status);
        $this->artisan('miniapps:approve', ['package' => 'sample-app', 'version' => '1.1.0', '--approver-id' => $admin->id])->assertExitCode(0);
        $this->assertSame(403, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $launchId, 'capability' => 'catalog', 'input' => []])->http_status);
        $fresh = $this->operate('POST', "miniapps/$id/launch");
        $this->assertSame(200, $fresh->http_status);
        $this->assertSame(200, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $fresh->result['launch']['id'], 'capability' => 'catalog', 'input' => []])->http_status);
        config()->set('commerce.actions.unsafe', ['enabled' => true, 'roles' => ['customer']]);
        $installation = MiniAppInstallation::findOrFail($id);
        $release = MiniAppVersion::findOrFail($installation->mini_app_version_id);
        $manifest = $release->manifest;
        $manifest['capabilities'][] = 'unsafe';
        $release->update(['manifest' => $manifest]);
        $installation->update(['grants' => [...$installation->grants, 'unsafe']]);
        $this->assertSame(403, $this->operate('POST', "miniapps/$id/invoke", ['launch_id' => $fresh->result['launch']['id'], 'capability' => 'unsafe', 'input' => []])->http_status);
    }

    public function test_bridge_rechecks_bundled_plugin_enablement(): void
    {
        Storage::fake('local');
        config()->set('miniapps.asset_origin', 'http://miniapps.test');
        config()->set('app.url', 'http://api.test');
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $admin = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Admin]);
        $customer = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Customer]);
        $path = $this->archive(['manifest.json' => json_encode(['id' => 'loyalty-ui', 'name' => 'Loyalty UI', 'version' => '1.0.0', 'entry' => 'index.html', 'capabilities' => ['plugin.loyalty.balance']])]);
        try {
            $version = app(MiniAppArchive::class)->import($path, 'public', null);
        } finally {
            unlink($path);
        }
        config()->set('miniapps.approver_user_ids', [$admin->id]);
        $this->artisan('miniapps:approve', ['package' => 'loyalty-ui', 'version' => '1.0.0', '--approver-id' => $admin->id])->assertExitCode(0);
        $plugin = PluginInstallation::create(['shop_id' => $shop->id, 'plugin_id' => PluginInstallation::Loyalty, 'enabled' => false, 'customer_enabled' => false]);
        Sanctum::actingAs($admin);
        $installed = $this->operate('POST', 'admin/miniapps', ['package_id' => $version->package_id, 'enabled' => true, 'grants' => ['plugin.loyalty.balance']]);
        $id = $installed->result['miniapp']['id'];
        Sanctum::actingAs($customer);
        $launch = $this->operate('POST', "miniapps/$id/launch");
        $launchId = $launch->result['launch']['id'];
        $call = ['launch_id' => $launchId, 'capability' => 'plugin.loyalty.balance', 'input' => []];
        $this->assertSame(403, $this->operate('POST', "miniapps/$id/invoke", $call)->http_status);
        $plugin->update(['enabled' => true, 'customer_enabled' => true]);
        $allowed = $this->operate('POST', "miniapps/$id/invoke", $call);
        $this->assertSame(200, $allowed->http_status);
        $this->assertSame(['balance' => ['points' => 0]], $allowed->result['response']);
        $plugin->update(['enabled' => false]);
        $this->assertSame(403, $this->operate('POST', "miniapps/$id/invoke", $call)->http_status);
    }

    public function test_assistant_update_prepares_current_version_and_rejects_foreign_installation(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $other = Shop::create(['slug' => 'other', 'name' => 'Other']);
        $admin = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Admin]);
        $package = MiniAppPackage::create(['slug' => 'sample-app', 'name' => 'Sample App', 'visibility' => MiniAppPackage::Public]);
        $release = MiniAppVersion::create(['package_id' => $package->id, 'version' => '1.0.0', 'digest' => str_repeat('a', 64), 'archive_path' => 'unused.zip', 'asset_hashes' => [], 'manifest' => ['id' => 'sample-app', 'name' => 'Sample App', 'version' => '1.0.0', 'entry' => 'index.html', 'capabilities' => ['catalog']], 'approved_at' => now()]);
        $owned = MiniAppInstallation::create(['shop_id' => $shop->id, 'package_id' => $package->id, 'mini_app_version_id' => $release->id, 'version' => 4, 'enabled' => false, 'grants' => []]);
        $foreign = MiniAppInstallation::create(['shop_id' => $other->id, 'package_id' => $package->id, 'mini_app_version_id' => $release->id, 'enabled' => false, 'grants' => []]);
        Sanctum::actingAs($admin);
        $draft = $this->operate('POST', 'assistant', ['action' => 'updateMiniapp', 'data' => ['id' => $owned->id, 'enabled' => true]]);
        $this->assertSame(200, $draft->http_status);
        $this->assertSame(4, $draft->result['preview']['input']['expected_version']);
        $confirmed = $this->operate('POST', 'assistant', ['conversation_id' => $draft->result['conversation_id'], 'conversation_version' => $draft->result['conversation_version'], 'confirm' => true]);
        $this->assertSame(200, $confirmed->http_status);
        $this->assertTrue($owned->fresh()->enabled);
        $this->assertSame(5, $owned->fresh()->version);
        $this->assertSame(404, $this->operate('POST', 'assistant', ['action' => 'updateMiniapp', 'data' => ['id' => $foreign->id, 'enabled' => true]])->http_status);
    }
}
