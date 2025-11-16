graph TB
    Start([Start: Infrastructure Assessment]) --> Audit[Examine Existing Infrastructure]
    
    Audit --> CPU[Assess CPU Performance<br/>- Core count<br/>- Clock speed<br/>- Age & generation]
    Audit --> Storage[Assess Storage<br/>- Capacity utilization<br/>- IOPS performance<br/>- Type: HDD/SSD/NVMe]
    Audit --> Power[Assess Power Infrastructure<br/>- UPS capacity<br/>- Power consumption<br/>- Cooling requirements]
    
    CPU --> Analysis{Analysis & Planning}
    Storage --> Analysis
    Power --> Analysis
    
    Analysis --> Decision{Choose Deployment Model}
    
    Decision -->|Option 1| Hybrid[Hybrid On-Prem + Cloud]
    Decision -->|Option 2| FullCloud[Full Cloud Migration]
    
    %% Hybrid Path
    Hybrid --> H1[On-Premises Refresh]
    H1 --> H1A[Upgrade CPUs<br/>- Latest gen processors<br/>- Increased core count]
    H1 --> H1B[Upgrade Storage<br/>- NVMe SSDs<br/>- Expand capacity]
    H1 --> H1C[Upgrade Power<br/>- Enhanced UPS<br/>- Efficient PSUs]
    
    H1A --> H2[Cloud Extension]
    H1B --> H2
    H1C --> H2
    
    H2 --> H2A[Configure Cloud Resources<br/>- Burst compute: EC2/Azure VMs<br/>- Cloud storage: S3/Azure Blob<br/>- Backup & DR in cloud]
    H2A --> H3[Setup Hybrid Connectivity<br/>- VPN/Direct Connect<br/>- Hybrid identity<br/>- Data sync solutions]
    H3 --> HybridDone[Hybrid Infrastructure Ready]
    
    %% Full Cloud Path
    FullCloud --> C1[Select Cloud Provider<br/>AWS/Azure/GCP]
    C1 --> C2[Configure Compute<br/>- Right-sized VM instances<br/>- Auto-scaling groups<br/>- Serverless options]
    C2 --> C3[Configure Storage<br/>- Block storage: EBS/Managed Disks<br/>- Object storage: S3/Blob<br/>- Database services]
    C3 --> C4[Configure Power/Infrastructure<br/>- No hardware management<br/>- Built-in redundancy<br/>- Global availability zones]
    C4 --> C5[Migration Process<br/>- Data transfer<br/>- Application deployment<br/>- Testing & validation]
    C5 --> CloudDone[Full Cloud Infrastructure Ready]
    
    HybridDone --> Monitor[Ongoing Monitoring & Optimization]
    CloudDone --> Monitor
    
    Monitor --> End([Continuous Improvement])
    
    style Start fill:#e1f5ff
    style End fill:#e1f5ff
    style Hybrid fill:#fff4e6
    style FullCloud fill:#e8f5e9
    style HybridDone fill:#fff4e6
    style CloudDone fill:#e8f5e9
    style Decision fill:#f3e5f5
