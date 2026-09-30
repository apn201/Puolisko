<?php
// GET ?id=<taskId> -> { status, output?, error? }
require __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') pk_fail(405, 'GET only');
pk_check_access();
$id = (string)($_GET['id'] ?? '');
if (!preg_match('~^[A-Za-z0-9_\-+/=]{10,200}$~', $id)) pk_fail(400, 'Bad task id');

$data = pk_call('GET', '/s2s/v2.0/task/skin-analysis/' . rawurlencode($id));
$status = $data['task_status'] ?? 'running';
if ($status === 'success') {
    $out = [];
    foreach (($data['results']['output'] ?? []) as $o) {
        $out[$o['type']] = [
            'ui_score' => $o['ui_score'] ?? null,
            'raw_score' => $o['raw_score'] ?? null,
            'mask_urls' => $o['mask_urls'] ?? [],
        ];
    }
    pk_json(200, ['status' => 'success', 'output' => (object)$out]);
}
if ($status === 'error') pk_json(200, ['status' => 'error', 'error' => $data['error'] ?? $data['error_message'] ?? 'analysis failed']);
pk_json(200, ['status' => 'running']);
