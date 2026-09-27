<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    use SoftDeletes;

    public const Queued = 'queued';

    public const Creating = 'creating';

    public const Pending = 'pending';

    public const Review = 'review';

    public const Paid = 'paid';

    public const Cancelled = 'cancelled';

    public const Stripe = 'stripe';

    public const Billplz = 'billplz';

    public const Custom = 'custom';

    public const Simulated = 'simulated';

    protected $guarded = ['id'];

    protected $visible = ['public_id', 'invoice_id', 'provider', 'status', 'label', 'checkout_url', 'paid_at'];

    protected $appends = ['label', 'invoice_id'];

    public function getInvoiceIdAttribute(): string
    {
        return $this->public_id;
    }

    public static function options(string $field = 'status'): array
    {
        if ($field === 'provider') {
            return [self::Stripe => 'Stripe', self::Billplz => 'DuitNow QR (Billplz)', self::Custom => 'Custom payment', self::Simulated => 'Simulated payment'];
        }

        return [self::Queued => 'Preparing payment', self::Creating => 'Preparing payment',
            self::Pending => 'Awaiting payment', self::Review => 'Payment needs merchant review',
            self::Paid => 'Paid', self::Cancelled => 'Payment cancelled'];
    }

    public function getLabelAttribute(): string
    {
        return self::options()[$this->status];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(PaymentEvent::class);
    }

    protected function casts(): array
    {
        return ['sandbox' => 'boolean', 'stock_released' => 'boolean', 'attempts' => 'integer',
            'next_check_at' => 'datetime', 'lease_until' => 'datetime', 'paid_at' => 'datetime'];
    }
}
