<?php

namespace App\Models;

use Database\Factories\ServiceInboxFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ServiceInbox extends ServiceDelivery
{
    /** @use HasFactory<ServiceInboxFactory> */
    use HasFactory;

    protected $table = 'service_inboxes';
}
