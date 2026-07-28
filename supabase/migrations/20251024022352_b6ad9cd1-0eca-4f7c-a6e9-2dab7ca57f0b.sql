-- Atualizar tabela pvp_match_players - transferir dados de ErenYeager para Sebastiaum
UPDATE pvp_match_players 
SET player_name = 'Sebastiaum' 
WHERE player_name = 'ErenYeager';

-- Atualizar tabela pvp_kill_logs - killer_name
UPDATE pvp_kill_logs 
SET killer_name = 'Sebastiaum' 
WHERE killer_name = 'ErenYeager';

-- Atualizar tabela pvp_kill_logs - victim_name
UPDATE pvp_kill_logs 
SET victim_name = 'Sebastiaum' 
WHERE victim_name = 'ErenYeager';

-- Remover registro duplicado de characters
DELETE FROM characters 
WHERE name = 'ErenYeager';