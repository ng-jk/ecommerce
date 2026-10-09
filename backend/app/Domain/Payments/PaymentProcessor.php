<?php

namespace App\Domain\Payments;

use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\Product;
use App\Modules\Events\Interface\Events;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use UnexpectedValueException;

class PaymentProcessor
{
    public function __construct(private Billplz $provider) {}

    private function readyEvent(Builder $query): void
    {
        $query->whereNull('processed_at')->where('attempts', '<', 5)
            ->where(fn ($q) => $q->whereNull('available_at')->orWhere('available_at', '<=', now()));
    }

    public function processNext(): bool
    {
        $claim = DB::transaction(function () {
            $payment = Payment::where(fn ($q) => $q->whereNull('lease_until')->orWhere('lease_until', '<=', now()))
                ->where(function ($q) {
                    $q->whereIn('status', [Payment::Queued, Payment::Creating])
                        ->orWhere(fn ($q) => $q->where('status', Payment::Pending)->where('next_check_at', '<=', now()))
                        ->orWhereHas('events', fn ($q) => $this->readyEvent($q));
                })->orderBy('id')->lock(DB::getDriverName() === 'pgsql' ? 'FOR UPDATE SKIP LOCKED' : true)->first();
            if (! $payment) {
                return null;
            }
            $event = $payment->events()->where(fn ($q) => $this->readyEvent($q))->orderBy('id')->first();
            $create = $payment->status === Payment::Queued && ! $event;
            if ($payment->status === Payment::Creating && ! $event) {
                // A crashed POST may have created a bill. Never send it again.
                $payment->update(['status' => Payment::Review, 'lease' => null, 'lease_until' => null]);
                app(Events::class)->publish('payment.review', 'payment', $payment->id,
                    ['payment_id' => $payment->public_id, 'status' => Payment::Review], 'payment:'.$payment->id.':review');

                return ['recovered' => true];
            }
            $payment->update(['lease' => (string) Str::uuid(), 'lease_until' => now()->addSeconds(60),
                'status' => $create ? Payment::Creating : $payment->status]);

            return compact('payment', 'event', 'create');
        });
        if ($claim === null) {
            return false;
        }
        if (isset($claim['recovered'])) {
            return true;
        }
        $payment = $claim['payment'];
        $event = $claim['event'];
        try {
            // External I/O is outside the business transaction; the lease fences stale workers.
            $provider = $payment->provider === 'stripe' ? app(Stripe::class) : $this->provider;
            $bill = $payment->provider === 'custom' ? app(PaymentProviders::class)->customBill($payment, $event)
                : ($claim['create'] ? $provider->create($payment)
                    : $provider->fetch($payment, $event ? $event->payload['id'] : $payment->bill_id));
            $this->apply($payment, $bill, $event);
        } catch (\Throwable $error) {
            DB::transaction(function () use ($payment, $event, $claim) {
                $locked = Payment::lockForUpdate()->findOrFail($payment->id);
                if ($locked->lease !== $payment->lease) {
                    return;
                }
                $attempts = $locked->attempts + 1;
                $terminal = in_array($locked->status, [Payment::Paid, Payment::Cancelled], true);
                $locked->update(['lease' => null, 'lease_until' => null, 'attempts' => $attempts,
                    'status' => $terminal ? $locked->status : ($claim['create'] || $attempts >= 12 ? Payment::Review : $locked->status),
                    'next_check_at' => now()->addMinutes(5)]);
                if ($locked->status === Payment::Review) {
                    app(Events::class)->publish('payment.review', 'payment', $locked->id,
                        ['payment_id' => $locked->public_id, 'status' => Payment::Review], 'payment:'.$locked->id.':review');
                }
                if ($event) {
                    $event->increment('attempts');
                    $event->update(['available_at' => now()->addMinutes(5)]);
                }
            });
            // Provider payloads and exception messages can contain payer details or credentials.
            logger()->warning('Payment provider operation needs attention', ['payment' => $payment->public_id, 'error_type' => $error::class]);
        }

        return true;
    }

    private function apply(Payment $claim, array $bill, ?PaymentEvent $event): void
    {
        DB::transaction(function () use ($claim, $bill, $event) {
            $payment = Payment::lockForUpdate()->findOrFail($claim->id);
            if ($payment->lease !== $claim->lease) {
                return;
            }
            $order = Order::lockForUpdate()->findOrFail($payment->order_id);
            $previousStatus = $payment->status;
            $id = $bill['id'] ?? null;
            $valid = is_string($id) && preg_match('/^[a-zA-Z0-9_-]{1,240}$/D', $id)
                && ($payment->bill_id === null || $payment->bill_id === $id)
                && ($bill['collection_id'] ?? null) === $payment->collection_id
                && ($bill['reference_2'] ?? null) === $payment->public_id
                && ($bill['amount'] ?? null) === $order->total
                && is_bool($bill['paid'] ?? null)
                && in_array($bill['state'] ?? null, ['due', 'paid', 'deleted'], true)
                && (($bill['state'] === 'paid') === $bill['paid'])
                && (! $bill['paid'] || ($bill['paid_amount'] ?? null) === $order->total);
            if (! $valid) {
                throw new UnexpectedValueException('Provider bill does not match this order.');
            }
            $url = $payment->provider === 'billplz' ? 'https://'.$this->provider->host($payment->sandbox).'/bills/'.$id : ($bill['checkout_url'] ?? null);
            // Use a canonical provider URL, never an arbitrary response URL.
            $next = $bill['paid'] ? Payment::Paid : ($bill['state'] === 'deleted' ? Payment::Cancelled : Payment::Pending);
            if ($payment->status === Payment::Cancelled && $next === Payment::Paid) {
                throw new UnexpectedValueException('Payment after confirmed deletion requires merchant review.');
            }
            if ($payment->status !== Payment::Paid && $payment->status !== Payment::Cancelled) {
                if ($next === Payment::Cancelled && ! $payment->stock_released) {
                    $products = Product::withTrashed()->whereIn('id', array_column($order->items, 'product_id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
                    foreach ($order->items as $item) {
                        $product = $products->get($item['product_id']);
                        $product->increment('stock', $item['quantity']);
                        $product->increment('version');
                    }
                    $payment->stock_released = true;
                }
                $payment->status = $next;
                $payment->paid_at = $next === Payment::Paid ? now() : null;
                $order->increment('version');
            }
            $payment->fill(['bill_id' => $id, 'checkout_url' => $payment->status === Payment::Pending ? $url : null,
                'lease' => null, 'lease_until' => null, 'attempts' => 0,
                'next_check_at' => $payment->status === Payment::Pending && $payment->provider !== 'custom' ? now()->addMinutes(5) : null])->save();
            if ($event) {
                $event->update(['processed_at' => now()]);
            }
            if ($payment->status !== $previousStatus) {
                app(Events::class)->publish('payment.'.$payment->status, 'payment', $payment->id,
                    ['payment_id' => $payment->public_id, 'status' => $payment->status, 'order_id' => $order->id],
                    'payment:'.$payment->id.':'.$payment->status);
            }
        });
    }
}
