<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_users', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 100);
            $table->string('email')->unique();
            $table->string('password');
            $table->string('account_status', 24)->default('active');
            $table->unsignedBigInteger('auth_version')->default(0);
            $table->timestamps();
            $table->softDeletes();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE platform_users ADD CONSTRAINT platform_users_email_normalized CHECK (email = lower(btrim(email)) AND email <> '')");
            DB::statement("ALTER TABLE platform_users ADD CONSTRAINT platform_users_status_valid CHECK (account_status IN ('active', 'disabled'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_users');
    }
};
