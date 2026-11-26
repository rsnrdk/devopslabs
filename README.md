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
