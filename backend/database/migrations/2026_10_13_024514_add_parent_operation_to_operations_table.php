<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('operations', function (Blueprint $table) {
            $table->foreignId('parent_operation_id')->nullable()->unique()->constrained('operations');
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE operations DROP CONSTRAINT operation_status_valid');
            DB::statement("ALTER TABLE operations ADD CONSTRAINT operation_status_valid CHECK (status IN ('queued', 'processing', 'succeeded', 'rejected', 'failed', 'delegated'))");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('operations')->where('status', 'delegated')->update(['status' => 'failed']);
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE operations DROP CONSTRAINT operation_status_valid');
            DB::statement("ALTER TABLE operations ADD CONSTRAINT operation_status_valid CHECK (status IN ('queued', 'processing', 'succeeded', 'rejected', 'failed'))");
        }
        Schema::table('operations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_operation_id');
        });
    }
};
