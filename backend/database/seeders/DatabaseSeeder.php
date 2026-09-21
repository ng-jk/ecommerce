<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new \RuntimeException('Demo seeding is restricted to local and testing environments.');
        }
        $catalogs = [
            'fashion' => ['Maison', [
                ['The everyday overshirt', 'Layers', 18900, 'photo-1596755094514-f87e34085b2c', 'A relaxed cotton layer, made for the moments between plans.', ['Material' => '100% organic cotton', 'Fit' => 'Relaxed, unisex', 'Colour' => 'Warm ivory']],
                ['City carry tote', 'Accessories', 12900, 'photo-1553062407-98eeb64c6a62', 'All your daily essentials. One beautifully uncomplicated bag.', ['Material' => 'Heavyweight canvas', 'Capacity' => '18 litres']],
                ['Weekend knit', 'Knitwear', 23900, 'photo-1434389677669-e08b4cac3105', 'An easy silhouette with a soft, textured finish.', ['Material' => 'Cotton blend', 'Care' => 'Cold gentle wash']],
                ['Everywhere sneakers', 'Footwear', 27900, 'photo-1549298916-b41d501d3772', 'Clean lines and an easy stride, from first coffee to last train.', ['Upper' => 'Soft leather', 'Sole' => 'Natural rubber']],
                ['Linen day shirt', 'Layers', 15900, 'photo-1598033129183-c4f50c736f10', 'Lightweight linen with a lived-in feel.', ['Material' => '100% linen', 'Fit' => 'Regular']],
                ['Everyday timepiece', 'Accessories', 34900, 'photo-1524805444758-089113d48a6d', 'A quiet detail. A lasting impression.', ['Movement' => 'Quartz', 'Case' => '38 mm stainless steel']],
            ]],
            'electronics' => ['Volt', [
                ['Studio headphones', 'Audio', 49900, 'photo-1546435770-a3e426bf472b', 'Find your focus with immersive sound and all-day comfort.', ['Battery' => '40 hours', 'Connection' => 'Bluetooth 5.3', 'Noise control' => 'Active cancellation']],
                ['Mechanical keyboard', 'Workspace', 32900, 'photo-1587829741301-dc798b83add3', 'A satisfying feel. A cleaner desk. Built for your best work.', ['Layout' => '75% compact', 'Switches' => 'Tactile', 'Connection' => 'USB-C / Bluetooth']],
                ['Pocket speaker', 'Audio', 18900, 'photo-1608043152269-423dbba4e7e1', 'Big sound for small adventures.', ['Battery' => '12 hours', 'Protection' => 'IP67', 'Weight' => '340 g']],
                ['Mirrorless camera', 'Cameras', 289900, 'photo-1516035069371-29a1b244cc32', 'Capture the details that make a day worth remembering.', ['Sensor' => '24 MP APS-C', 'Video' => '4K 30 fps', 'Lens mount' => 'Interchangeable']],
                ['Precision mouse', 'Workspace', 15900, 'photo-1527814050087-3793815479db', 'Thoughtfully shaped for comfortable, precise control.', ['Sensor' => '4000 DPI', 'Connection' => 'Wireless', 'Battery' => '70 days']],
                ['Smart wrist companion', 'Wearables', 69900, 'photo-1523275335684-37898b6baf30', 'Your daily rhythm, at a glance.', ['Display' => 'AMOLED', 'Battery' => '7 days', 'Resistance' => '5 ATM']],
            ]],
        ];
        foreach ($catalogs as $slug => [$name, $products]) {
            $shop = Shop::firstOrCreate(['slug' => $slug], ['name' => $name]);
            foreach (['customer', 'admin'] as $role) {
                User::firstOrCreate(['shop_id' => $shop->id, 'email' => "$role@$slug.demo"], ['name' => ucfirst($role).' '.$name, 'role' => $role, 'password' => 'Portfolio2026!']);
            }
            foreach ($products as [$title, $category, $price, $image, $description, $specs]) {
                Product::firstOrCreate(['shop_id' => $shop->id, 'name' => $title], ['category' => $category, 'price' => $price, 'stock' => 25, 'description' => $description, 'image_url' => "https://images.unsplash.com/$image?w=1000&auto=format&fit=crop&q=85", 'specifications' => $specs]);
            }
        }
    }
}
