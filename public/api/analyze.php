<?php
// POST { image: <base64 jpeg>, contentType } -> { taskId }. The photo is passed on, not kept.
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') pk_fail(405, 'POST only');
pk_check_access();

$in = json_decode(file_get_contents('php://input'), true);
$image = is_array($in) ? ($in['image'] ?? null) : null;
$type = is_array($in) ? ($in['contentType'] ?? 'image/jpeg') : 'image/jpeg';
if (!is_string($image)) pk_fail(400, 'image missing');
if (!in_array($type, ['image/jpeg', 'image/png'], true)) pk_fail(400, 'jpeg or png only');
$bytes = base64_decode(preg_replace('/^data:[^,]+,/', '', $image), true);
unset($image, $in);
if ($bytes === false) pk_fail(400, 'bad image encoding');
if (strlen($bytes) > 3 * 1024 * 1024) pk_fail(413, 'image too large');

$ext = $type === 'image/png' ? 'png' : 'jpg';
$init = pk_call('POST', '/s2s/v2.0/file', [
    'files' => [['content_type' => $type, 'file_name' => "puolisko.$ext", 'file_size' => strlen($bytes)]],
]);
$file = $init['files'][0] ?? null;
$req = $file['requests'][0] ?? null;
if (!$file || !$req) pk_fail(502, 'YouCam file init failed');

$headers = [];
foreach (($req['headers'] ?? []) as $k => $v) $headers[] = "$k: $v";
[$code] = pk_http($req['method'] ?? 'PUT', $req['url'], $headers, $bytes);
unset($bytes);
if ($code < 200 || $code >= 300) pk_fail(502, "Upload failed: $code");

$task = pk_call('POST', '/s2s/v2.0/task/skin-analysis', [
    'src_file_id' => $file['file_id'],
    'dst_actions' => YC_CONCERNS,
    'miniserver_args' => ['enable_mask_overlay' => false],
    'format' => 'json',
]);
pk_json(200, ['taskId' => $task['task_id'] ?? null]);
