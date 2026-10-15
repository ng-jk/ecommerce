<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApplicationDefinition extends Model
{
    protected $fillable = ['application_key', 'name', 'service', 'contract_version'];
}
