<?php

namespace App\Models;

use Database\Factories\ServiceRequestNonceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ServiceRequestNonce extends Model
{
    /** @use HasFactory<ServiceRequestNonceFactory> */
    use HasFactory;

    use SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['source', 'nonce', 'deleted_at'];
}
