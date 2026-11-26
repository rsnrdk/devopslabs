# nest-devops

Невеликий застосунок на Nest.js для лабораторних робіт з DevOps.

| ЛР | Тема | Де лежить |
|---|---|---|
| 3 | Розгортання в Kubernetes (minikube) | [`k8s/`](k8s) |
| 4 | Пакування в Helm-чарт | [`charts/nest-devops/`](charts/nest-devops) |
| 5 | GitOps з Argo CD | [`bootstrap/`](bootstrap), [`argocd-apps/`](argocd-apps) |

## Застосунок

| Ендпоінт | Що робить |
|---|---|
| `GET /` | HTML-сторінка: версія, под, що відповів, відвідування по подах (зберігаються в PostgreSQL) |
| `GET /version` | `{"version":"1.0.0"}`: версія, зашита в образ |
| `GET /api/info` | версія, середовище, привітання й ім'я пода в JSON. Відповідає з `Connection: close`, тож кожен запит може потрапити на інший под |
| `GET /api/visits` | статистика відвідувань |
| `DELETE /api/visits` | очищає відвідування; потрібен заголовок `x-admin-token` зі значенням із Secret |
| `GET /health/live` | liveness-проба: процес живий (база не перевіряється) |
| `GET /health/ready` | readiness-проба: база доступна |

### Параметри (змінні оточення)

| Змінна | Звідки | За замовчуванням | Призначення |
|---|---|---|---|
| `APP_VERSION` | build arg образу | `dev` | версія, яку показує застосунок |
| `APP_ENV` | ConfigMap | `local` | назва середовища |
| `APP_GREETING` | ConfigMap | `Hello from Nest.js` | заголовок сторінки |
| `DB_HOST` | ConfigMap | `localhost` | хост PostgreSQL |
| `DB_PORT` | ConfigMap | `5432` | порт PostgreSQL |
| `DB_NAME` | ConfigMap | `app` | назва бази |
| `DB_USER` | ConfigMap | `app` | користувач бази |
| `DB_PASSWORD` | **Secret** | обов'язковий | пароль бази |
| `ADMIN_TOKEN` | **Secret** | обов'язковий | токен для `DELETE /api/visits` |

Без обов'язкових змінних застосунок не стартує й одразу пише, чого бракує.

### Локальний запуск

```bash
npm ci
npm test
npm run test:e2e
docker compose up --build        # http://localhost:3000
```

### Образи

Версія передається під час збірки, тег `latest` не використовується:

```bash
docker build --build-arg APP_VERSION=1.0.0 -t ghcr.io/rsnrdk/nest-devops:1.0.0 .
docker build --build-arg APP_VERSION=1.1.0 -t ghcr.io/rsnrdk/nest-devops:1.1.0 .
```

CI (`.github/workflows/ci.yml`) на кожен push запускає lint і тести. Git-тег на кшталт `v1.1.0` додатково збирає й публікує образ `ghcr.io/rsnrdk/nest-devops:1.1.0`.

---

## ЛР-3: Kubernetes

### Кластер

```bash
minikube start --driver=docker
kubectl get nodes
kubectl get pods -n kube-system
minikube addons enable metrics-server
minikube addons enable ingress
```

### Образ у кластері

Образ або публікується в GHCR, або завантажується прямо в minikube:

```bash
minikube image load ghcr.io/rsnrdk/nest-devops:1.0.0
minikube image load ghcr.io/rsnrdk/nest-devops:1.1.0
```

### Розгортання однією командою

```bash
kubectl apply -f k8s/
kubectl get pods,deployments,replicasets,services,ingress,pvc -n nest-devops
```

Файли застосовуються в алфавітному порядку, тому namespace (`00-…`) створюється першим.

| Файл | Об'єкт | Примітка |
|---|---|---|
| `00-namespace.yaml` | Namespace `nest-devops` | усе інше створюється в ньому |
| `01-configmap.yaml` | ConfigMap | `APP_ENV`, `APP_GREETING`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` |
| `02-secret.yaml` | Secret | `DB_PASSWORD`, `ADMIN_TOKEN` (тестові значення для minikube) |
| `10-postgres-pvc.yaml` | PersistentVolumeClaim | диск 1Gi для PostgreSQL |
| `11-postgres-deployment.yaml` | Deployment | PostgreSQL, 1 репліка, стратегія `Recreate` |
| `12-postgres-service.yaml` | Service (ClusterIP) | `nest-devops-postgres:5432` |
| `20-app-deployment.yaml` | Deployment | 2 репліки, requests/limits, readiness і liveness, rolling update без простою |
| `21-app-service.yaml` | Service (NodePort) | `nest-devops:80` у кластері, порт `30080` на вузлі |
| `22-app-ingress.yaml` | Ingress | `http://nest-devops.local` |

### Відкрити застосунок

```bash
minikube service nest-devops -n nest-devops
```

Через Ingress: додати `127.0.0.1 nest-devops.local` у `C:\Windows\System32\drivers\etc\hosts`, в окремому терміналі тримати `minikube tunnel` і відкрити http://nest-devops.local.

### ConfigMap і Secret у контейнері

```bash
kubectl exec -n nest-devops deploy/nest-devops -- printenv APP_ENV APP_GREETING DB_HOST DB_PASSWORD ADMIN_TOKEN
```

### Життєвий цикл

```bash
# самовідновлення
kubectl get pods -n nest-devops -l app.kubernetes.io/name=nest-devops
kubectl delete pod -n nest-devops <ім'я-пода>
kubectl get pods -n nest-devops -w

# масштабування; потім на сторінці кнопка "Send 20 requests" покаже кілька подів
kubectl scale deployment nest-devops -n nest-devops --replicas=4

# rolling update на 1.1.0
kubectl set image deployment/nest-devops -n nest-devops app=ghcr.io/rsnrdk/nest-devops:1.1.0
kubectl annotate deployment/nest-devops -n nest-devops kubernetes.io/change-cause="update to 1.1.0"
kubectl rollout status deployment/nest-devops -n nest-devops

# історія і відкат
kubectl rollout history deployment/nest-devops -n nest-devops
kubectl rollout undo deployment/nest-devops -n nest-devops
```

Доступність під час оновлення: у другому терміналі PowerShell, поки йде оновлення, крутити цикл (адресу дає `minikube service nest-devops -n nest-devops --url`):

```powershell
$url = "http://127.0.0.1:<порт>"
while ($true) { try { (Invoke-RestMethod "$url/api/info").version } catch { "DOWN" }; Start-Sleep -Milliseconds 300 }
```

Вивід перемикається з `1.0.0` на `1.1.0` без жодного `DOWN`.

### Діагностика

```bash
kubectl set image deployment/nest-devops -n nest-devops app=ghcr.io/rsnrdk/nest-devops:9.9.9
kubectl get pods -n nest-devops                       # ErrImagePull / ImagePullBackOff
kubectl describe pod -n nest-devops <ім'я-пода>        # Events: образ не знайдено
kubectl logs -n nest-devops deploy/nest-devops
kubectl exec -it -n nest-devops deploy/nest-devops -- sh
kubectl rollout undo deployment/nest-devops -n nest-devops   # виправлення
```

Завдяки `maxUnavailable: 0` старі поди продовжують працювати, поки новий не може стартувати.

### Прибирання

```bash
kubectl delete -f k8s/
```

---

## ЛР-4: Helm-чарт

Чарт лежить у [`charts/nest-devops/`](charts/nest-devops) і створює той самий набір об'єктів, що й `k8s/`. Єдина відмінність: namespace створює Helm (`--create-namespace`), а не шаблон.

```
charts/nest-devops/
├── Chart.yaml               # name, description, version, appVersion
├── values.yaml              # значення за замовчуванням = середовище розробки
├── values-dev.yaml          # dev: 1 репліка, малі ресурси, образ 1.1.0, без Ingress
├── values-prod.yaml         # prod: 3 репліки, більші ресурси, образ 1.0.0, Ingress, Secret поза чартом
└── templates/
    ├── _helpers.tpl         # іменовані шаблони: fullname, labels, selectorLabels, secretName, ...
    ├── configmap.yaml  secret.yaml  deployment.yaml  service.yaml  ingress.yaml
    ├── postgres-pvc.yaml  postgres-deployment.yaml  postgres-service.yaml
    ├── hook-pre-upgrade-db-check.yaml   # хук pre-upgrade
    ├── tests/test-connection.yaml       # helm test
    └── NOTES.txt            # підказка після встановлення
```

### version і appVersion

- **`version: 0.1.0`** — версія **чарта**, тобто шаблонів і значень за замовчуванням. Змінився шаблон (наприклад, додали пробу) — піднімаємо `version`.
- **`appVersion: "1.0.0"`** — версія **застосунку** в чарті. Якщо `image.tag` порожній, саме вона стає тегом образу. Вийшов новий образ без змін у шаблонах — змінюється лише `appVersion`.

Це дві незалежні лінійки версій: той самий чарт `0.1.0` може розгорнути застосунок `1.0.0` або `1.1.0`.

### Параметри values.yaml

| Параметр | За замовчуванням (dev) | Опис |
|---|---|---|
| `replicaCount` | `1` | кількість подів застосунку |
| `image.repository` | `ghcr.io/rsnrdk/nest-devops` | репозиторій образу |
| `image.tag` | `""` (= `appVersion`) | тег образу |
| `image.pullPolicy` | `IfNotPresent` | коли завантажувати образ |
| `service.type` | `NodePort` | тип Service |
| `service.port` | `80` | порт Service |
| `service.nodePort` | `""` (обирає Kubernetes) | порт на вузлі |
| `ingress.enabled` | `false` | створювати Ingress |
| `ingress.className` | `nginx` | клас Ingress |
| `ingress.host` | `nest-devops.local` | домен |
| `resources` | 100m/128Mi → 500m/256Mi | requests і limits застосунку |
| `rollingUpdate.maxSurge` / `maxUnavailable` | `1` / `0` | стратегія оновлення |
| `config.environment` | `dev` | `APP_ENV` у ConfigMap |
| `config.greeting` | `Hello from Helm` | `APP_GREETING` у ConfigMap |
| `secrets.existingSecret` | `""` | ім'я вже створеного Secret; якщо задано, чарт свій Secret не створює |
| `secrets.dbPassword` | `dev-db-password` | `DB_PASSWORD` (тестове значення) |
| `secrets.adminToken` | `dev-admin-token` | `ADMIN_TOKEN` (тестове значення) |
| `postgres.enabled` | `true` | розгортати PostgreSQL разом із застосунком |
| `postgres.image.repository` / `tag` | `postgres` / `17-alpine` | образ бази |
| `postgres.database` / `user` | `app` / `app` | назва бази й користувач |
| `postgres.resources` | 100m/128Mi → 500m/512Mi | ресурси бази |
| `postgres.persistence.enabled` | `true` | створювати PersistentVolumeClaim |
| `postgres.persistence.size` | `1Gi` | розмір диска |
| `postgres.persistence.storageClass` | `""` (за замовчуванням кластера) | StorageClass |
| `externalDatabase.host` / `port` | `""` / `5432` | зовнішня база, якщо `postgres.enabled=false` |
| `hooks.preUpgradeDbCheck.enabled` | `true` | хук перевірки бази перед `helm upgrade` |
| `tests.enabled` | `true` | под для `helm test` |
| `tests.image` | `busybox:1.37` | образ тестового пода |

### Пріоритет значень

Від найслабшого до найсильнішого:

1. `values.yaml` у чарті;
2. файли `-f` / `--values` (якщо їх кілька, наступний перекриває попередній);
3. `--set` / `--set-string` (найсильніший).

Тобто `helm upgrade ... -f values-prod.yaml --set image.tag=1.1.0` розгорне prod-конфігурацію, але з образом `1.1.0`.

### Перевірка без встановлення

```bash
helm lint charts/nest-devops
helm lint charts/nest-devops -f charts/nest-devops/values-prod.yaml

helm template nest-devops charts/nest-devops -n nest-devops -f charts/nest-devops/values-dev.yaml  > dev.yaml
helm template nest-devops charts/nest-devops -n nest-devops -f charts/nest-devops/values-prod.yaml > prod.yaml
git diff --no-index dev.yaml prod.yaml
```

### Встановлення

```bash
# dev
helm install nest-devops charts/nest-devops -n nest-devops --create-namespace -f charts/nest-devops/values-dev.yaml

# prod: спочатку Secret поза Git
kubectl create namespace nest-devops-prod
kubectl create secret generic nest-devops-prod-secrets -n nest-devops-prod \
  --from-literal=DB_PASSWORD=<пароль> --from-literal=ADMIN_TOKEN=<токен>
helm install nest-devops charts/nest-devops -n nest-devops-prod -f charts/nest-devops/values-prod.yaml
```

Перед `helm install` треба прибрати розгортання з ЛР-3 (`kubectl delete -f k8s/`), бо імена об'єктів збігаються.

### Стан релізу

```bash
helm list -n nest-devops
helm status nest-devops -n nest-devops
helm get values nest-devops -n nest-devops          # значення, задані при встановленні
helm get values nest-devops -n nest-devops --all    # усі значення разом із дефолтами
kubectl get secrets -n nest-devops -l owner=helm    # тут Helm зберігає ревізії: sh.helm.release.v1.nest-devops.vN
```

### Життєвий цикл релізу

```bash
helm upgrade nest-devops charts/nest-devops -n nest-devops --reuse-values --set image.tag=1.1.0
# DB_PASSWORD має збігатися з паролем, з яким уже ініціалізовано базу
kubectl create secret generic nest-devops-prod-secrets -n nest-devops \
  --from-literal=DB_PASSWORD=dev-db-password --from-literal=ADMIN_TOKEN=prod-admin-token
helm upgrade nest-devops charts/nest-devops -n nest-devops -f charts/nest-devops/values-prod.yaml
helm history nest-devops -n nest-devops
helm rollback nest-devops 2 -n nest-devops
helm history nest-devops -n nest-devops             # з'явилась нова ревізія "Rollback to 2"
helm uninstall nest-devops -n nest-devops
kubectl get all,pvc,secret,cm,ingress -n nest-devops
```

Відкат не стирає історію: він створює **нову** ревізію з конфігурацією старої.

### Завдання на вибір: хук і тест релізу

- **`hook-pre-upgrade-db-check.yaml`**: Job з анотацією `helm.sh/hook: pre-upgrade`. Перед кожним `helm upgrade` (але не перед `install`) він через `pg_isready` перевіряє, що база відповідає. Якщо ні, оновлення зупиняється і поточна версія лишається працювати. Після успіху Job видаляється (`hook-delete-policy: hook-succeeded`).
- **`tests/test-connection.yaml`**: под з `helm.sh/hook: test`. Він перевіряє `/health/ready` і те, що `/version` повертає саме той тег, який розгорнув реліз.

```bash
helm test nest-devops -n nest-devops
kubectl get events -n nest-devops | grep pre-upgrade    # слід від хука після helm upgrade
```
