<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('operations', function (Blueprint $table): void {
            $table->foreignId('shop_id')->nullable()->change();
            $table->foreignId('platform_user_id')->nullable()->constrained('platform_users');
            $table->index(['platform_user_id', 'status', 'id']);
        });
        Schema::table('organization_memberships', function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable()->change();
            $table->foreignId('platform_user_id')->nullable()->constrained('platform_users');
            $table->unique(['organization_id', 'platform_user_id']);
            $table->index(['platform_user_id', 'status', 'organization_id']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE operations ADD CONSTRAINT operation_principal_transport CHECK ((shop_id IS NOT NULL AND platform_user_id IS NULL) OR (shop_id IS NULL AND user_id IS NULL))');
            DB::statement('ALTER TABLE organization_memberships ADD CONSTRAINT membership_exactly_one_principal CHECK ((user_id IS NOT NULL) <> (platform_user_id IS NOT NULL))');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE organization_memberships DROP CONSTRAINT membership_exactly_one_principal');
            DB::statement('ALTER TABLE operations DROP CONSTRAINT operation_principal_transport');
        }
        Schema::table('organization_memberships', function (Blueprint $table): void {
            $table->dropIndex(['platform_user_id', 'status', 'organization_id']);
            $table->dropUnique(['organization_id', 'platform_user_id']);
            $table->dropConstrainedForeignId('platform_user_id');
            $table->foreignId('user_id')->nullable(false)->change();
        });
        Schema::table('operations', function (Blueprint $table): void {
            $table->dropIndex(['platform_user_id', 'status', 'id']);
            $table->dropConstrainedForeignId('platform_user_id');
            $table->foreignId('shop_id')->nullable(false)->change();
        });
    }
};
