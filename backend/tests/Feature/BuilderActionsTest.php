<?php

namespace Tests\Feature;

use App\Modules\Builder\AuthorizedBuilderScope;
use App\Modules\Builder\BuilderActions;
use App\Modules\Builder\BuilderBlockSchema;
use App\Modules\Builder\Models\Page;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;
use PDOException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class BuilderActionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/builder', '--force' => true]);
    }

    private function envelope(string $action, array $input = [], int $org = 7): array
    {
        return ['id' => 'e37a3e1e-62df-4b13-bbbf-fc0963f5c189', 'source' => 'platform',
            'destination' => 'builder', 'topic' => 'builder.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 11, 'organization_id' => $org,
                'application' => 'builder', 'action' => $action, 'auth_version' => 0, 'token_id' => 43],
                'command' => ['input' => $input, 'operation_id' => '3b630bea-44aa-4567-91c7-d61d70161802']]];
    }

    private function runAction(string $action, array $input = [], ?int $id = null, int $org = 7): array
    {
        $scope = AuthorizedBuilderScope::fromVerifiedExchange($this->envelope($action, $input, $org), fn () => true);

        return DB::transaction(fn (): array => app(BuilderActions::class)->execute($scope, $input, $id));
    }

    private function create(string $slug = 'home', int $org = 7): array
    {
        return $this->runAction('builder.pages.create', ['slug' => $slug, 'title' => 'Home',
            'blocks' => [['type' => 'heading', 'text' => 'Welcome', 'level' => 1]]], null, $org)['page'];
    }

    private function invalid(string $field, callable $action): void
    {
        try {
            $action();
            $this->fail('Invalid input accepted.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey($field, $error->errors());
        }
    }

    private function conflict(callable $action): void
    {
        try {
            $action();
            $this->fail('Conflict accepted.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
    }

    public function test_scoped_paginated_directory_and_reserved_slug(): void
    {
        $one = $this->create();
        $two = $this->create('about');
        $this->create('home', 8);
        $list = $this->runAction('builder.pages.list', ['status' => 'draft', 'per_page' => 1]);
        $this->assertSame([$one], $list['data']);
        $this->assertSame(2, $list['meta']['total']);
        $this->assertSame(2, $list['meta']['last_page']);
        $this->assertSame(Page::options(), $list['meta']['options']['status']);
        $this->assertSame(BuilderBlockSchema::options(), $list['meta']['options']['block_type']);
        $this->assertSame([$two], $this->runAction('builder.pages.list', ['page' => 2, 'per_page' => 1])['data']);
        $this->assertSame([$two], $this->runAction('builder.pages.list', ['page' => '2', 'per_page' => '1'])['data']);
        $this->invalid('per_page', fn () => $this->runAction('builder.pages.list', ['per_page' => 51]));
        foreach (['0', '01', '1e1', '999999999999999999999999999999'] as $bad) {
            $this->invalid('page', fn () => $this->runAction('builder.pages.list', ['page' => $bad]));
        }
        $this->invalid('status', fn () => $this->runAction('builder.pages.list', ['status' => 'private']));
        $this->invalid('slug', fn () => $this->create('home'));
        $this->invalid('slug', fn () => $this->create('Bad/Slug'));
        $this->invalid('rogue', fn () => $this->runAction('builder.pages.list', ['rogue' => true]));
        $this->assertSame(3, Page::query()->count());
    }

    public function test_versioned_publish_render_snapshot_and_tenant_boundary(): void
    {
        $page = $this->create();
        $this->assertNull($page['published_version']);
        try {
            $this->runAction('builder.pages.render', [], $page['id']);
            $this->fail('Draft rendered.');
        } catch (HttpException $error) {
            $this->assertSame(404, $error->getStatusCode());
        }
        $this->assertSame($page, $this->runAction('builder.pages.detail', [], $page['id'])['page']);
        $this->conflict(fn () => $this->runAction('builder.pages.update', ['title' => 'Stale',
            'blocks' => [], 'expected_version' => 8], $page['id']));
        $published = $this->runAction('builder.pages.publish', ['expected_version' => 0], $page['id'])['page'];
        $this->assertSame(Page::Published, $published['status']);
        $this->assertSame(1, $published['published_version']);
        $this->conflict(fn () => $this->runAction('builder.pages.publish', ['expected_version' => 1], $page['id']));
        $render = $this->runAction('builder.pages.render', [], $page['id'])['render'];
        $this->assertSame('Home', $render['title']);
        $this->assertSame($page['blocks'], $render['blocks']);
        $edited = $this->runAction('builder.pages.update', ['title' => 'Next title', 'blocks' => [
            ['type' => 'paragraph', 'text' => 'Next draft']], 'expected_version' => 1], $page['id'])['page'];
        $this->assertSame(Page::Draft, $edited['status']);
        $this->assertSame(2, $edited['version']);
        $this->assertSame($render, $this->runAction('builder.pages.render', [], $page['id'])['render']);
        $this->conflict(fn () => $this->runAction('builder.pages.publish', ['expected_version' => 1], $page['id']));
        $second = $this->runAction('builder.pages.publish', ['expected_version' => 2], $page['id'])['page'];
        $this->assertSame(3, $second['published_version']);
        $this->assertSame('Next title', $this->runAction('builder.pages.render', [], $page['id'])['render']['title']);
        $this->assertArrayNotHasKey('organization_id', $second);
        $this->assertArrayNotHasKey('created_by_platform_user_id', $second);
        $this->expectException(ModelNotFoundException::class);
        $this->runAction('builder.pages.detail', [], $page['id'], 8);
    }

    public function test_blocks_accept_only_bounded_declarative_plain_content_and_https_links(): void
    {
        $input = ['slug' => 'blocks', 'title' => 'Blocks', 'blocks' => [
            ['type' => 'heading', 'text' => '  Heading  ', 'level' => 2],
            ['type' => 'paragraph', 'text' => '  Paragraph  '],
            ['type' => 'image', 'src' => 'https://example.org/img.png', 'alt' => 'Cover'],
            ['type' => 'button', 'label' => 'Visit', 'url' => 'https://example.org/next'],
        ]];
        $page = $this->runAction('builder.pages.create', $input)['page'];
        $this->assertSame('Heading', $page['blocks'][0]['text']);
        $this->assertSame('Paragraph', $page['blocks'][1]['text']);
        $this->assertSame('https://example.org/img.png', $page['blocks'][2]['src']);
        foreach ([
            [['type' => 'html', 'html' => '<script>alert(1)</script>'], 'blocks.0'],
            [['type' => 'paragraph', 'text' => '<img onerror=alert(1)>'], 'blocks.0.text'],
            [['type' => 'heading', 'text' => 'Bad', 'level' => '1'], 'blocks.0.level'],
            [['type' => 'image', 'src' => '//evil.test/x', 'alt' => 'Alt'], 'blocks.0.src'],
            [['type' => 'image', 'src' => 'https://user:pass@example.org/x', 'alt' => 'Alt'], 'blocks.0.src'],
            [['type' => 'button', 'label' => 'Go', 'url' => 'javascript:alert(1)'], 'blocks.0.url'],
            [['type' => 'paragraph', 'text' => 'Okay', 'onclick' => 'evil()'], 'blocks.0'],
            ['not a block', 'blocks.0'],
        ] as [$block, $field]) {
            $this->invalid($field, fn () => $this->runAction('builder.pages.create', [
                'slug' => 'unsafe', 'title' => 'Unsafe', 'blocks' => [$block]]));
        }
        $this->invalid('blocks', fn () => $this->runAction('builder.pages.create', [
            'slug' => 'too-many', 'title' => 'Too many', 'blocks' => array_fill(0, 21, ['type' => 'paragraph', 'text' => 'x'])]));
        $this->assertSame(1, Page::query()->count());
    }

    public function test_verified_scope_rejects_malformed_or_untrusted_authority(): void
    {
        $message = $this->envelope('builder.pages.list');
        $this->assertNull(AuthorizedBuilderScope::fromVerifiedExchange($message, fn () => false));
        try {
            AuthorizedBuilderScope::fromVerifiedExchange($message, fn () => null);
            $this->fail('Non-boolean authorization accepted.');
        } catch (LogicException $error) {
            $this->assertSame('Service authorization must return a boolean.', $error->getMessage());
        }
        $message['payload']['scope']['application'] = 'crm';
        $this->invalid('message.payload.scope.application',
            fn () => AuthorizedBuilderScope::fromVerifiedExchange($message, fn () => true));
    }

    public function test_soft_deleted_pages_are_hidden_and_slug_remains_reserved(): void
    {
        $page = $this->create();
        Page::query()->findOrFail($page['id'])->delete();
        $this->assertSame([], $this->runAction('builder.pages.list')['data']);
        $this->invalid('slug', fn () => $this->create());
        $this->expectException(ModelNotFoundException::class);
        $this->runAction('builder.pages.detail', [], $page['id']);
    }

    public function test_non_unique_database_errors_are_not_disguised_as_slug_validation(): void
    {
        $this->assertSame('factory-page', Page::factory()->create(['slug' => 'factory-page'])->slug);
        Page::creating(function (): void {
            throw new QueryException('sqlite', 'insert', [], new PDOException('storage unavailable'));
        });
        $this->expectException(QueryException::class);
        $this->runAction('builder.pages.create', ['slug' => 'new-page', 'title' => 'New', 'blocks' => []]);
    }
}
