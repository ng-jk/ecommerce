<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SolutionOffering extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['deleted_at', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['deliverables' => 'array', 'published_at' => 'datetime',
            'version' => 'integer', 'unit_amount' => 'integer'];
    }
}
