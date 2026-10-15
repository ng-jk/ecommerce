<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_definitions', function (Blueprint $table): void {
            $table->id();
            $table->string('application_key', 80)->unique();
            $table->string('name', 120);
            $table->string('service', 80);
            $table->string('contract_version', 40);
            $table->timestamps();
        });
        $now = now();
        DB::table('application_definitions')->insert(array_map(fn (array $row): array => [
            'application_key' => $row[0], 'name' => $row[1], 'service' => $row[2],
            'contract_version' => '1.0', 'created_at' => $now, 'updated_at' => $now,
        ], [
            ['erp', 'ERP', 'erp'], ['hr', 'HR', 'hr'], ['learning', 'Learning', 'learning'],
            ['insights', 'Insights', 'insights'], ['crm', 'CRM', 'crm'], ['helpdesk', 'Helpdesk', 'helpdesk'],
            ['lending', 'Lending', 'lending'], ['framework', 'Framework workspace', 'platform'],
            ['builder', 'Builder', 'builder'], ['commerce', 'Commerce', 'commerce'],
        ]));
    }

    public function down(): void
    {
        Schema::dropIfExists('application_definitions');
    }
};
