<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mini_app_packages', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 80)->unique();
            $table->string('name', 120);
            $table->string('visibility', 10);
            $table->foreignId('owner_shop_id')->nullable()->constrained('shops');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['visibility', 'id']);
            $table->index(['owner_shop_id', 'id']);
        });
        Schema::create('mini_app_versions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('package_id')->constrained('mini_app_packages');
            $table->string('version', 40);
            $table->char('digest', 64)->unique();
            $table->string('archive_path');
            $table->json('asset_hashes');
            $table->json('manifest');
            $table->unsignedBigInteger('approval_generation')->default(0);
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users');
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['package_id', 'version']);
            $table->index(['package_id', 'approved_at', 'id']);
        });
        Schema::create('mini_app_installations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shop_id')->constrained();
            $table->foreignId('package_id')->constrained('mini_app_packages');
            $table->foreignId('mini_app_version_id')->constrained('mini_app_versions');
            $table->unsignedBigInteger('version')->default(0);
            $table->boolean('enabled')->default(false);
            $table->json('grants');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['shop_id', 'package_id']);
            $table->index(['shop_id', 'enabled', 'id']);
        });
        Schema::create('mini_app_launches', function (Blueprint $table): void {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('shop_id')->constrained();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('installation_id')->constrained('mini_app_installations');
            $table->foreignId('mini_app_version_id')->constrained('mini_app_versions');
            $table->unsignedBigInteger('installation_version');
            $table->unsignedBigInteger('approval_generation');
            $table->timestamp('expires_at');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['shop_id', 'user_id', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mini_app_launches');
        Schema::dropIfExists('mini_app_installations');
        Schema::dropIfExists('mini_app_versions');
        Schema::dropIfExists('mini_app_packages');
    }
};
