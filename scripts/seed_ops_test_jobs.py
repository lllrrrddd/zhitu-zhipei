"""Add three clearly labeled fictional jobs to the running local prototype."""

import json
from urllib.request import Request, urlopen


BASE_URL = "http://127.0.0.1:8005/api"
JOBS = [
    {
        "title": "[测试 O01] 初级安全运维工程师",
        "company": "虚构示例企业",
        "location": "郑州",
        "job_type": "校招",
        "description": "负责 Linux 与 Windows 主机日常运维、终端安全产品部署、故障处理、Docker 容器维护和运维文档编写。",
        "requirements": "接受计算机相关专业 2026 届本科毕业生。熟悉 Linux、Windows、EDR、Docker；Python 脚本能力为加分项。",
        "note": "团队虚构测试岗位 O01，请勿作为真实招聘信息使用。",
        "origin_source": "团队虚构测试样本",
    },
    {
        "title": "[测试 O02] 初级平台运维工程师",
        "company": "虚构示例企业",
        "location": "郑州",
        "job_type": "校招",
        "description": "负责 Linux 服务器巡检、Nginx 配置、MySQL 维护和脚本自动化。",
        "requirements": "接受计算机相关专业本科毕业生。需要处理值班告警，熟悉监控平台。",
        "note": "团队虚构测试岗位 O02，请勿作为真实招聘信息使用。",
        "origin_source": "团队虚构测试样本",
    },
    {
        "title": "[测试 O03] 高级云原生平台工程师",
        "company": "虚构示例企业",
        "location": "北京",
        "job_type": "社招",
        "description": "负责 Kubernetes 集群架构、服务网格、分布式存储和大规模生产环境故障应急。",
        "requirements": "要求硕士学历、5 年以上生产环境经验，熟悉 Kubernetes 集群架构和大规模生产运维。",
        "note": "团队虚构测试岗位 O03，请勿作为真实招聘信息使用。",
        "origin_source": "团队虚构测试样本",
    },
]


def request(method, path, payload=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload else None
    req = Request(
        BASE_URL + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urlopen(req, timeout=30) as response:
        return json.load(response)


existing = request("GET", "/jobs?page_size=100")["items"]
for payload in JOBS:
    job = next((item for item in existing if item["title"] == payload["title"]), None)
    if job is None:
        job = request("POST", "/jobs", payload)
    job_id = job["id"]
    result = request("POST", f"/jobs/{job_id}/match-analysis")
    detail = request("GET", f"/jobs/{job_id}/match-analysis")
    score = detail.get("reference_score") or {}
    print(
        json.dumps(
            {
                "job_id": job_id,
                "title": payload["title"],
                "hard_gate": result.get("hard_gate"),
                "admission": result.get("admission"),
                "reference_score": score.get("score"),
                "notes": result.get("notes", []),
            },
            ensure_ascii=False,
        )
    )
