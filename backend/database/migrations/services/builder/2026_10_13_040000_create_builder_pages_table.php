<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('builder_pages', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->unsignedBigInteger('updated_by_platform_user_id');
            $table->string('slug', 100);
            $table->string('title', 200);
            $table->json('draft_blocks');
            $table->json('published_blocks')->nullable();
            $table->string('published_title', 200)->nullable();
            $table->string('status', 16)->default('draft');
            $table->unsignedBigInteger('version')->default(0);
            $table->unsignedBigInteger('published_version')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['organization_id', 'status', 'id'], 'builder_pages_org_status_id');
        });
        DB::statement('CREATE UNIQUE INDEX builder_pages_org_slug ON builder_pages (organization_id, lower(slug))');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS builder_pages_org_slug');
        Schema::dropIfExists('builder_pages');
    }
};
