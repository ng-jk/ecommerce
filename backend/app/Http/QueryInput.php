<?php

namespace App\Http;

use Illuminate\Http\Request;

final class QueryInput
{
    public static function read(Request $request, string $action): array
    {
        $input = $request->all();
        // URL query values are strings. JSON commands retain strict integer types.
        if ($request->isMethod('GET') && $action === 'hr.leave.owner.list'
            && is_string($input['employee_id'] ?? null)
            && preg_match('/^[1-9][0-9]*$/D', $input['employee_id']) === 1) {
            $parsed = filter_var($input['employee_id'], FILTER_VALIDATE_INT);
            if ($parsed !== false) {
                $input['employee_id'] = $parsed;
            }
        }

        return $input;
    }
}
