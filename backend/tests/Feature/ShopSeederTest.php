<?php

namespace Tests\Feature;

use App\Models\Shop;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShopSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_production_bootstrap_creates_only_shops_and_repeated_runs_are_idempotent(): void
    {
        $this->app->instance('env', 'production');
        $this->artisan('db:seed', ['--class' => ShopSeeder::class, '--force' => true])->assertSuccessful();
        $firstIds = Shop::orderBy('slug')->pluck('id', 'slug')->all();

        $this->artisan('db:seed', ['--class' => ShopSeeder::class, '--force' => true])->assertSuccessful();

        $this->assertSame($firstIds, Shop::orderBy('slug')->pluck('id', 'slug')->all());
        $this->assertDatabaseCount('shops', 2);
        $this->assertDatabaseHas('shops', ['slug' => 'fashion', 'name' => 'Maison']);
        $this->assertDatabaseHas('shops', ['slug' => 'electronics', 'name' => 'Volt']);
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('products', 0);
    }

    public function test_bootstrap_preserves_existing_merchant_names_and_unrelated_shops(): void
    {
        $this->app->instance('env', 'production');
        $fashion = Shop::create(['slug' => 'fashion', 'name' => 'Merchant name']);
        $unrelated = Shop::create(['slug' => 'existing', 'name' => 'Existing merchant']);

        $this->artisan('db:seed', ['--class' => ShopSeeder::class, '--force' => true])->assertSuccessful();

        $this->assertSame('Merchant name', $fashion->fresh()->name);
        $this->assertSame('Existing merchant', $unrelated->fresh()->name);
        $this->assertDatabaseCount('shops', 3);
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('products', 0);
    }
}
