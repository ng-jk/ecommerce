<?php

namespace Tests\Unit;

use App\Http\QueryInput;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class QueryInputTest extends TestCase
{
    public static function inputs(): array
    {
        return [
            ['GET', 'hr.leave.owner.list', ['employee_id' => '12', 'status' => 'pending'], ['employee_id' => 12, 'status' => 'pending']],
            ['GET', 'hr.leave.owner.list', ['employee_id' => (string) PHP_INT_MAX], ['employee_id' => PHP_INT_MAX]],
            ['GET', 'hr.leave.owner.list', ['employee_id' => '999999999999999999999999'], ['employee_id' => '999999999999999999999999']],
            ['GET', 'hr.leave.owner.list', ['employee_id' => '1.2'], ['employee_id' => '1.2']],
            ['GET', 'hr.leave.owner.list', ['employee_id' => '-1'], ['employee_id' => '-1']],
            ['GET', 'hr.leave.owner.list', ['employee_id' => '+1'], ['employee_id' => '+1']],
            ['GET', 'hr.leave.owner.list', ['employee_id' => '01'], ['employee_id' => '01']],
            ['GET', 'hr.leave.owner.list', ['employee_id' => ['12']], ['employee_id' => ['12']]],
            ['GET', 'hr.leave.owner.list', ['employee_id' => 12], ['employee_id' => 12]],
            ['GET', 'hr.leave.owner.list', [], []],
            ['POST', 'hr.leave.owner.list', ['employee_id' => '12'], ['employee_id' => '12']],
            ['GET', 'hr.leave.mine.list', ['employee_id' => '12'], ['employee_id' => '12']],
        ];
    }

    #[DataProvider('inputs')]
    public function test_only_canonical_url_filter_integers_are_decoded(string $method, string $action, array $input, array $expected): void
    {
        $request = Request::create('/', $method, $input);

        $this->assertSame($expected, QueryInput::read($request, $action));
        $this->assertSame($input, $request->all());
    }
}
