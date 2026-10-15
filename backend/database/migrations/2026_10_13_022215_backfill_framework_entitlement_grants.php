<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('organization_applications')->where('application_key', 'framework')
            ->where('state', 'installed')->whereNull('deleted_at')->orderBy('id')
            ->chunkById(200, function ($applications): void {
                foreach ($applications as $application) {
                    DB::table('application_entitlement_grants')->insertOrIgnore([
                        'organization_id' => $application->organization_id,
                        'application_key' => 'framework',
                        'source' => 'free',
                        'evidence_ref' => 'framework-migration:'.$application->organization_id,
                        'starts_at' => $application->created_at,
                        'expires_at' => null,
                        'evidence' => json_encode(['kind' => 'historical_framework_install', 'installation_id' => $application->id], JSON_THROW_ON_ERROR),
                        'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Historical entitlement evidence is intentionally retained.
    }
};
