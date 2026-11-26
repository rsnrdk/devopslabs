{{/*
Chart name, can be overridden with nameOverride.
*/}}
{{- define "nest-devops.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Full name of the objects, built from the release name, so the chart can be installed twice:
  release "nest-devops" -> nest-devops        release "staging" -> staging-nest-devops
*/}}
{{- define "nest-devops.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "nest-devops.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Image tag: image.tag from values, otherwise appVersion from Chart.yaml.
*/}}
{{- define "nest-devops.imageTag" -}}
{{- .Values.image.tag | default .Chart.AppVersion }}
{{- end }}

{{/*
Labels shared by every object of the release.
*/}}
{{- define "nest-devops.commonLabels" -}}
helm.sh/chart: {{ include "nest-devops.chart" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: {{ include "nest-devops.name" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Application: selector labels (must never change after install) and full labels.
*/}}
{{- define "nest-devops.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nest-devops.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "nest-devops.labels" -}}
{{ include "nest-devops.commonLabels" . }}
{{ include "nest-devops.selectorLabels" . }}
app.kubernetes.io/component: app
app.kubernetes.io/version: {{ include "nest-devops.imageTag" . | quote }}
{{- end }}

{{/*
PostgreSQL: name, selector labels and full labels.
*/}}
{{- define "nest-devops.postgres.fullname" -}}
{{- printf "%s-postgres" (include "nest-devops.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "nest-devops.postgres.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nest-devops.name" . }}-postgres
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "nest-devops.postgres.labels" -}}
{{ include "nest-devops.commonLabels" . }}
{{ include "nest-devops.postgres.selectorLabels" . }}
app.kubernetes.io/component: database
{{- end }}

{{/*
Name of the Secret: an existing one, or the one created by this chart.
*/}}
{{- define "nest-devops.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- printf "%s-secrets" (include "nest-devops.fullname" .) }}
{{- end }}
{{- end }}

{{- define "nest-devops.configMapName" -}}
{{- printf "%s-config" (include "nest-devops.fullname" .) }}
{{- end }}

{{/*
Database host: the bundled PostgreSQL Service, or an external host.
*/}}
{{- define "nest-devops.dbHost" -}}
{{- if .Values.postgres.enabled }}
{{- include "nest-devops.postgres.fullname" . }}
{{- else }}
{{- required "externalDatabase.host is required when postgres.enabled=false" .Values.externalDatabase.host }}
{{- end }}
{{- end }}

{{- define "nest-devops.dbPort" -}}
{{- if .Values.postgres.enabled }}5432{{ else }}{{ .Values.externalDatabase.port }}{{ end }}
{{- end }}
