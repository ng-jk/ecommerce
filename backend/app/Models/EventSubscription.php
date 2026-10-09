<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EventSubscription extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['handler', 'deleted_at'];
}
