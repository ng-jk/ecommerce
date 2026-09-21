<?php

use App\Models\Shop;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Validator;

Artisan::command('commerce:admin {shop : fashion or electronics} {email}', function () {
    $slug = $this->argument('shop');
    if (! in_array($slug, ['fashion', 'electronics'], true)) {
        $this->error('Shop must be fashion or electronics.');

        return 1;
    }
    $email = strtolower(trim($this->argument('email')));
    $name = $this->ask('Administrator name');
    $password = $this->secret('Password (at least 10 characters)');
    $validator = Validator::make(compact('email', 'name', 'password'), ['email' => 'required|email|max:255', 'name' => 'required|string|max:100', 'password' => 'required|string|min:10']);
    if ($validator->fails()) {
        $this->error($validator->errors()->first());

        return 1;
    }
    $shop = Shop::firstOrCreate(['slug' => $slug], ['name' => $slug === 'fashion' ? 'Maison' : 'Volt']);
    $existing = User::where('shop_id', $shop->id)->where('email', $email)->first();
    if ($existing && ! $this->confirm('Replace this account’s password and grant shop administrator access?')) {
        return 1;
    }
    User::updateOrCreate(['shop_id' => $shop->id, 'email' => $email], ['name' => $name, 'password' => $password, 'role' => 'admin']);
    $this->info('Administrator saved for '.$shop->name.'.');

    return 0;
})->purpose('Create an administrator without installing demo credentials');
