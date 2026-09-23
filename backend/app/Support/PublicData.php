<?php

namespace App\Support;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class PublicData
{
    public static function page(LengthAwarePaginator $page): array
    {
        return ['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]];
    }
}
