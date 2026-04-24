-- Remove agendamento automático do send-reminders
-- Os lembretes agora são disparados manualmente pelo coordenador na plataforma
SELECT cron.unschedule('king-send-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-send-reminders');
