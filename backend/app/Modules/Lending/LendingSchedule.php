<?php

namespace App\Modules\Lending;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Validator;

final class LendingSchedule
{
    public function build(array $terms): array
    {
        $data = Validator::make($terms, [
            'principal_minor' => 'required|integer:strict|min:1|max:1000000000',
            'term_rate_numerator' => 'required|integer:strict|min:0|max:1000000|lte:term_rate_denominator',
            'term_rate_denominator' => 'required|integer:strict|min:1|max:1000000',
            'installment_count' => 'required|integer:strict|min:1|max:120',
            'interval_days' => 'required|integer:strict|min:1|max:365',
            'first_due_date' => 'required|date_format:Y-m-d',
        ])->validate();
        abort_if($data['installment_count'] * $data['interval_days'] > 3650, 422, 'The configured term exceeds 3650 days.');
        $principal = $data['principal_minor'];
        // Bounds keep this product below 10^15; ceil is exact in a signed 64-bit integer.
        $numerator = $principal * $data['term_rate_numerator'];
        $charge = intdiv($numerator + $data['term_rate_denominator'] - 1, $data['term_rate_denominator']);
        $count = $data['installment_count'];
        $first = CarbonImmutable::createFromFormat('!Y-m-d', $data['first_due_date'], 'UTC');
        abort_if($first->addDays(($count - 1) * $data['interval_days'])->year > 9999, 422, 'The final due date exceeds the supported calendar.');
        $rows = [];
        for ($index = 0; $index < $count; $index++) {
            $principalPart = intdiv($principal, $count) + (int) ($index < $principal % $count);
            $chargePart = intdiv($charge, $count) + (int) ($index < $charge % $count);
            $rows[] = ['number' => $index + 1, 'due_date' => $first->addDays($index * $data['interval_days'])->format('Y-m-d'),
                'principal_minor' => $principalPart, 'charge_minor' => $chargePart, 'total_minor' => $principalPart + $chargePart];
        }

        return ['principal_minor' => $principal, 'charge_minor' => $charge, 'total_minor' => $principal + $charge, 'installments' => $rows];
    }
}
