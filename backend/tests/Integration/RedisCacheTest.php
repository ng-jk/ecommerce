<?php

namespace Tests\Integration;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

class RedisCacheTest extends TestCase
{
    public function test_optional_redis_cache_round_trip_and_atomic_add(): void
    {
        $this->assertTrue(extension_loaded('redis'));
        $cache = Cache::store('redis');
        $key = 'integration:redis:'.Str::uuid();

        try {
            $this->assertTrue($cache->put($key, ['scope' => 'isolated-probe'], 30));
            $this->assertSame(['scope' => 'isolated-probe'], $cache->get($key));
            $this->assertFalse($cache->add($key, 'must-not-overwrite', 30));
            $this->assertSame(['scope' => 'isolated-probe'], $cache->get($key));
            $this->assertTrue($cache->forget($key));
            $this->assertNull($cache->get($key));
        } finally {
            $cache->forget($key);
        }
    }
}
