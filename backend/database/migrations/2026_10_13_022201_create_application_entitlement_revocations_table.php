<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_entitlement_revocations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('grant_id')->unique()->constrained('application_entitlement_grants');
            $table->string('reason', 160);
            $table->string('evidence_ref', 160)->unique();
            $table->timestamp('revoked_at');
            $table->timestamps();
            $table->softDeletes();
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("CREATE OR REPLACE FUNCTION reject_entitlement_revocation_change() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Entitlement revocations are immutable'; END; \$\$");
            DB::statement('CREATE TRIGGER immutable_entitlement_revocations BEFORE UPDATE OR DELETE ON application_entitlement_revocations FOR EACH ROW EXECUTE FUNCTION reject_entitlement_revocation_change()');
        } elseif (DB::getDriverName() === 'sqlite') {
            DB::statement("CREATE TRIGGER immutable_entitlement_revocations_update BEFORE UPDATE ON application_entitlement_revocations BEGIN SELECT RAISE(ABORT, 'Entitlement revocations are immutable'); END");
            DB::statement("CREATE TRIGGER immutable_entitlement_revocations_delete BEFORE DELETE ON application_entitlement_revocations BEGIN SELECT RAISE(ABORT, 'Entitlement revocations are immutable'); END");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('application_entitlement_revocations');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP FUNCTION IF EXISTS reject_entitlement_revocation_change()');
        }
    }
};
