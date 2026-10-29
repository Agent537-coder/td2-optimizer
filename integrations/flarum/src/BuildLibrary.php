<?php
namespace AgentHub;

use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Server\RequestHandlerInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Private data only. Native Flarum session/CSRF middleware protects writes. */
class BuildLibrary implements RequestHandlerInterface
{
    const KEY = 'agenthubBuildLibrary';
    const LIMIT = 40;
    private $db;
    public function __construct(ConnectionInterface $db) { $this->db = $db; }

    public static function normalize($value): array
    {
        return is_array($value) && isset($value['records']) && is_array($value['records'])
            ? $value : ['records'=>[]];
    }

    public static function validDocument($doc): bool
    {
        if (!is_array($doc) || ($doc['v'] ?? null) !== 1 || !is_array($doc['build'] ?? null)
            || !is_array($doc['items'] ?? null)) return false;
        foreach (['weapons'=>3,'gear'=>6,'talents'=>3,'mods'=>6,'skills'=>2] as $key=>$size) {
            if (!is_array($doc['items'][$key] ?? null) || !array_is_list($doc['items'][$key]) || count($doc['items'][$key]) !== $size) return false;
        }
        if (!is_array($doc['preview'] ?? null)) return false;
        foreach (['weapons'=>3,'gear'=>6,'skills'=>2] as $key=>$size) {
            if (!is_array($doc['preview'][$key] ?? null) || !array_is_list($doc['preview'][$key]) || count($doc['preview'][$key]) !== $size) return false;
        }
        $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!$json || strlen($json) > 65536 || preg_match('/data:|https?:|<|>|"(?:image|images|html|__proto__|constructor)"\s*:/i', $json)) return false;
        return true;
    }

    public function handle(ServerRequestInterface $request): JsonResponse
    {
        $actor = RequestUtil::getActor($request);
        if (!$actor->id) return $this->reply(['error'=>'login_required'], 401);
        $method = strtoupper($request->getMethod());
        if ($method === 'GET') {
            $library = self::normalize($actor->getPreference(self::KEY));
            return $this->reply(['data'=>array_values($library['records']), 'meta'=>['limit'=>self::LIMIT]]);
        }
        $body = (array) ($request->getParsedBody() ?: []);
        if (!in_array($method, ['POST','PATCH','DELETE'], true)) return $this->reply(['error'=>'method'], 405);
        if ($method !== 'DELETE') {
            if (!is_string($body['name'] ?? null)) return $this->reply(['error'=>'invalid'], 422);
            $name = trim($body['name']);
            if (!$name || mb_strlen($name) > 60 || !self::validDocument($body['document'] ?? null)) return $this->reply(['error'=>'invalid'], 422);
        }
        return $this->db->transaction(function () use ($actor, $method, $body) {
            // Re-read under a lock. No caller-supplied owner or user id is used.
            $user = User::where('id', $actor->id)->lockForUpdate()->firstOrFail();
            $library = self::normalize($user->getPreference(self::KEY));
            $records = $library['records'];
            if ($method !== 'POST' && (!is_string($body['id'] ?? null) || !preg_match('/^[a-f0-9]{24}$/D', $body['id']))) return $this->reply(['error'=>'invalid'], 422);
            $id = $method === 'POST' ? bin2hex(random_bytes(12)) : $body['id'];
            if ($method !== 'POST') {
                if (!isset($records[$id])) return $this->reply(['error'=>'not_found'], 404);
                if (($body['revision'] ?? null) !== $records[$id]['revision']) return $this->reply(['error'=>'changed'], 409);
            } elseif (count($records) >= self::LIMIT) return $this->reply(['error'=>'limit'], 409);
            if ($method === 'DELETE') unset($records[$id]);
            else {
                $now = gmdate('Y-m-d\TH:i:s\Z');
                $records[$id] = ['id'=>$id, 'name'=>trim($body['name']), 'document'=>$body['document'],
                    'revision'=>($records[$id]['revision'] ?? 0)+1,
                    'createdAt'=>$records[$id]['createdAt'] ?? $now, 'updatedAt'=>$now];
            }
            $user->setPreference(self::KEY, ['records'=>$records]);
            $user->save();
            return $this->reply(['data'=>$records[$id] ?? null], $method === 'POST' ? 201 : 200);
        });
    }

    private function reply(array $data, int $status = 200): JsonResponse
    { return new JsonResponse($data, $status, ['Cache-Control'=>'private, no-store']); }
}
