<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

abstract class Controller
{
    protected function validate(Request $request, array $rules): array
    {
        return Validator::make($request->all(), $rules)->validate();
    }
}
