# PostgreSQL Backup & Restore

## Backup

Lancer un backup manuel depuis la racine du projet (`/opt/epion`) :

```bash
./infra/postgres/backup.sh
```

Le script :
- Lit les credentials depuis `.env.production`
- Produit un dump au format custom PostgreSQL (`pg_dump -Fc`)
- Stocke le fichier dans `/opt/epion/backups/postgres/`
- Supprime automatiquement les dumps de plus de 14 jours

## Restauration

```bash
./infra/postgres/restore.sh /opt/epion/backups/postgres/epion-postgres-20260704-033000.dump
```

Le script demande une confirmation explicite (`RESTORE EPION`) avant d'écraser la base.

Stratégie : `pg_restore --clean --if-exists --no-owner --no-privileges` — supprime les objets existants avant de les recréer, sans toucher aux rôles/permissions Docker.

Après restauration, vérifier si des migrations Prisma doivent être appliquées :

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec epion-api npx prisma migrate deploy
```

## Stockage des backups

| Emplacement | Chemin |
|---|---|
| Serveur Hetzner | `/opt/epion/backups/postgres/` |
| Rétention locale | 14 jours |

Les backups locaux seuls ne suffisent pas : si le serveur est perdu, les dumps le sont aussi. Prévoir une copie offsite (Object Storage Hetzner, S3, rsync vers un second serveur) dès que la prod est stable.

## Cron quotidien

Ajouter au crontab du serveur Hetzner :

```bash
crontab -e
```

Exemple — backup tous les jours à 03:30 :

```
30 3 * * * /opt/epion/infra/postgres/backup.sh >> /var/log/epion-backup.log 2>&1
```

## Tester les restaurations

Créer un dump ne garantit rien. Un dump corrompu ou incomplet est pire qu'aucun backup (fausse confiance).

Pour tester sur un environnement non-prod :

1. Copier le dump sur une machine de test ou utiliser un conteneur local.
2. Lancer un service Postgres isolé :
   ```bash
   docker run --rm -d --name pg-test \
     -e POSTGRES_DB=epion_test \
     -e POSTGRES_USER=epion \
     -e POSTGRES_PASSWORD=test \
     -p 5433:5432 \
     pgvector/pgvector:pg16
   ```
3. Restaurer le dump :
   ```bash
   PGPASSWORD=test pg_restore -h localhost -p 5433 -U epion -d epion_test \
     --clean --if-exists --no-owner --no-privileges \
     /path/to/epion-postgres-XXXXXXXX-XXXXXX.dump
   ```
4. Vérifier que les tables, données et extensions (pgvector) sont présentes.
5. Supprimer le conteneur de test :
   ```bash
   docker rm -f pg-test
   ```

Planifier un test de restauration au moins une fois par mois.
