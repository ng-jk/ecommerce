<?php

namespace Database\Factories;

use App\Modules\Erp\Models\JournalLine;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<JournalLine> */
class ErpJournalLineFactory extends Factory
{
    protected $model = JournalLine::class;

    public function definition(): array
    {
        return ['organization_id' => 1, 'journal_id' => 1, 'account_id' => 1,
            'position' => 1, 'debit_minor' => 100, 'credit_minor' => 0];
    }
}
