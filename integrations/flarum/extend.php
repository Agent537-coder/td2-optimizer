<?php
use Flarum\Extend;
return [
    (new Extend\Routes('api'))
        ->get('/builds', 'agenthub.builds.list', \AgentHub\BuildLibrary::class)
        ->post('/builds', 'agenthub.builds.create', \AgentHub\BuildLibrary::class)
        ->patch('/builds', 'agenthub.builds.update', \AgentHub\BuildLibrary::class)
        ->delete('/builds', 'agenthub.builds.delete', \AgentHub\BuildLibrary::class),
];
