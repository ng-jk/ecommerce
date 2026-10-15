<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('organization_memberships', function (Blueprint $table): void {
            $table->unsignedBigInteger('version')->default(0);
            $table->index(['organization_id', 'id']);
            $table->index(['organization_id', 'status', 'id']);
            $table->index(['organization_id', 'role', 'id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('organization_memberships', function (Blueprint $table): void {
            $table->dropIndex(['organization_id', 'role', 'id']);
            $table->dropIndex(['organization_id', 'status', 'id']);
            $table->dropIndex(['organization_id', 'id']);
            $table->dropColumn('version');
        });
    }
};
