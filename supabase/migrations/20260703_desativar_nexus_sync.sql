-- Desativa a sincronização com o King Nexus, que está sendo descontinuado.
-- nexus-mes-analise passou a ser canônico em nexus_incidents (não escreve
-- mais no Nexus) — ver comentário no topo da função. Sem o sync rodando,
-- nexus_incidents/nexus_teacher_tracking/nexus_teacher_recurrences/
-- nexus_mes_analise_alerts ficam congeladas no último estado sincronizado,
-- que é o objetivo (histórico preservado, sem dependência viva do Nexus).

SELECT cron.unschedule('king-nexus-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-nexus-sync');
