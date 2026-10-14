# Database setup

`schema.sql` matches the `classes`, `students`, and `grades` tables used by the Express API. `seed.sql` upserts the six sample classes and four sample students. The application stores status as `studying`/`reserved`; its UI displays these as “Đang học”/“Bảo lưu”. GPA is calculated from `grades`, so the clean-database seed adds one 8.30 sample score for `DTC245200186`.

## New Docker database volume

The MySQL service mounts both scripts into `/docker-entrypoint-initdb.d`. MySQL runs them in filename order when it initializes an empty data volume:

```powershell
docker compose up -d db
docker compose logs db
```

The MySQL image only runs initialization scripts for an empty data directory. Restarting an existing database does not re-run these scripts.

## Existing database volume

In phpMyAdmin, select database `qlsv`, then import `schema.sql` followed by `seed.sql`. Both scripts are safe to re-run: class/student rows are matched by their unique codes, and the sample grade is inserted only if it does not already exist. Existing grades are never deleted. On a database that already has grades for the sample student, the displayed GPA remains the average of all that student's grades and may differ from 8.30.

Alternatively, from PowerShell run:

```powershell
docker compose exec -T db sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /docker-entrypoint-initdb.d/10-schema.sql && mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /docker-entrypoint-initdb.d/20-seed.sql'
```

The SQL does not reset the database and does not require `docker compose down -v`.
