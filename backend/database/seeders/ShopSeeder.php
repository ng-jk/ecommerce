<?php

namespace Database\Seeders;

use App\Models\Shop;
use Illuminate\Database\Seeder;

class ShopSeeder extends Seeder
{
    public function run(): void
    {
        Shop::firstOrCreate(['slug' => 'fashion'], ['name' => 'Maison']);
        Shop::firstOrCreate(['slug' => 'electronics'], ['name' => 'Volt']);
    }
}
