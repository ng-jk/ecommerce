<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DomainEvent extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['payload', 'event_key', 'deleted_at'];
}
