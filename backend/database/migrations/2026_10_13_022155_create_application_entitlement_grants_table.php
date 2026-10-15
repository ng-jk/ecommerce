<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_entitlement_grants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->string('application_key', 80);
            $table->string('source', 32);
            $table->string('evidence_ref', 160);
            $table->timestamp('starts_at');
            $table->timestamp('expires_at')->nullable();
            $table->json('evidence')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['source', 'evidence_ref']);
            $table->index(['organization_id', 'application_key', 'starts_at']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE application_entitlement_grants ADD CONSTRAINT entitlement_grant_source CHECK (source IN ('free', 'trial', 'verified_settlement', 'operator'))");
            DB::statement('ALTER TABLE application_entitlement_grants ADD CONSTRAINT entitlement_grant_time CHECK (expires_at IS NULL OR expires_at > starts_at)');
            DB::statement("ALTER TABLE application_entitlement_grants ADD CONSTRAINT entitlement_free_framework CHECK (source <> 'free' OR application_key = 'framework')");
            DB::statement("ALTER TABLE application_entitlement_grants ADD CONSTRAINT entitlement_trial_window CHECK (source <> 'trial' OR (expires_at IS NOT NULL AND expires_at <= starts_at + interval '30 days'))");
            DB::statement("CREATE OR REPLACE FUNCTION reject_entitlement_grant_change() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Entitlement grants are immutable'; END; \$\$");
            DB::statement('CREATE TRIGGER immutable_entitlement_grants BEFORE UPDATE OR DELETE ON application_entitlement_grants FOR EACH ROW EXECUTE FUNCTION reject_entitlement_grant_change()');
        } elseif (DB::getDriverName() === 'sqlite') {
            DB::statement("CREATE TRIGGER immutable_entitlement_grants_update BEFORE UPDATE ON application_entitlement_grants BEGIN SELECT RAISE(ABORT, 'Entitlement grants are immutable'); END");
            DB::statement("CREATE TRIGGER immutable_entitlement_grants_delete BEFORE DELETE ON application_entitlement_grants BEGIN SELECT RAISE(ABORT, 'Entitlement grants are immutable'); END");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('application_entitlement_grants');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP FUNCTION IF EXISTS reject_entitlement_grant_change()');
        }
    }
};
