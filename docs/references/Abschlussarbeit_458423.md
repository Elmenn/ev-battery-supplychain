![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image1.jpeg)

# Reinventing the supply chain through escrow smart contracts

#### by

> **Elias Odatey Addae Safo Matriculation Number 458423**
>
> A thesis submitted to
>
> Technische Universität Berlin
>
> School IV - Electrical Engineering and Computer Science Department of
> Telecommunication Systems
>
> Service-centric Networking Bachelor's Thesis
>
> November 5, 2024
>
> Supervised by: Prof. Dr. Axel Küpper
>
> Assistant supervisor: Prof. Dr.-Ing. Sebastian Möller

### Eidestattliche Erklärung / Statutory Declaration

> Hiermit erkläre ich, dass ich die vorliegende Arbeit selbstständig und
> eigenhändig sowie ohne unerlaubte fremde Hilfe und ausschließlich
> unter Verwendung der aufgeführten Quellen und Hilfsmittel angefertigt
> habe.
>
> I hereby declare that the thesis submitted is my own, unaided work,
> completed without any external help. Only the sources and resources
> listed were used. All passages taken from the sources and aids used,
> either unchanged or paraphrased, have been marked as such. Where
> generative Al tools were used, I have indicated the product name,
> manufacturer, the software version used, as well as the respective
> purpose (e.g. checking and improving language in the texts, systematic
> research). I am fully responsible for the selection, adoption, and all
> re- sults of the Al-generated output I use. I have taken note of the
> Principles for Ensuring Good Research Practice at TU Berlin dated 8
> March 2017.
> [https://www.tu.berlin/en/working-at-tu-](http://www.tu.berlin/en/working-at-tu-)
>
> berlin/important-documents/guidelinesdirectives/principles-forensuring-good-research-practice
> I further declare that I have not submitted the thesis in the same or
> similar form to any other examination authority.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image4.png)

> Berlin, November 5, 2024 Elias Safo

## Acknowledgments

> I want to thank my supervisor, Kaustbh Barman, for his invaluable
> support throughout the research, coding, and writing of this thesis.
> His guidance and trust in allowing me to contribute to his research
> have been instrumental, and I hope my contributions have been
> meaningful. I am also very grateful to my friends and family for
> providing much-needed distraction and encouragement during the
> challenging process of completing this work.

## Abstract

> A supply chain is a network of stakeholders and processes involved in
> producing, handling, and delivering a product from supplier to
> consumer. This thesis explores how blockchain tech- nology can address
> critical challenges within the supply chain by enhancing transparency,
> traceability, and efficiency. By implementing a decentralized
> application powered by smart contracts, we assess whether modern
> supply chains can be transformed to improve account- ability and
> streamline operations. Through this analysis, we aim to demonstrate
> how blockchain- based systems can redefine traditional supply chain
> models to meet evolving demands.

## Zusammenfassung

> Eine Lieferkette ist ein Netzwerk aus Beteiligten und Prozessen, die
> an der Herstellung, Hand- habung und Lieferung eines Produkts vom
> Lieferanten bis zum Verbraucher beteiligt sind. Diese Arbeit
> untersucht, wie die Blockchain-Technologie zentrale Herausforderungen
> inner- halb der Lieferkette bewältigen kann, indem sie Transparenz,
> Rückverfolgbarkeit und Effizienz erhöht. Durch die Implementierung
> einer dezentralen Anwendung, die auf Smart Contracts basiert, wird
> geprüft, ob moderne Lieferketten verbessert werden können, um
> Verantwortlichkeit zu stärken und Abläufe zu optimieren. Mit dieser
> Analyse soll aufgezeigt werden, wie Blockchain- basierte Systeme
> traditionelle Lieferkettenmodelle neu definieren können, um den
> wachsenden Anforderungen gerecht zu werden.

## Contents

## 

1.  [Introduction](#introduction) 1

2.  [Related Work](#related-work) 3

    1.  [Distributed Ledger Technology
        (DLT)](#distributed-ledger-technology-dlt) 3

    2.  [Blockchain](#blockchain) 3

        1.  [Technical Overview of
            Blockchain](#technical-overview-of-blockchain) 3

    3.  [Ethereum](#ethereum) 4

        1.  [Technical Overview Of
            Ethereum](#technical-overview-of-ethereum) 4

        2.  [Gas cost](#gas-cost) 4

    4.  [Smart Contracts](#smart-contracts) 5

        1.  [Escrow smart contracts](#escrow-smart-contracts) 5

    5.  [IPFS](#ipfs) 5

    6.  [Supply Chain](#supply-chain) 6

    7.  [Decentralized supply chain](#decentralized-supply-chain) 6

    8.  [Literature Review](#literature-review) 6

        1.  [The Power of a Blockchain-based Supply
            Chain](#the-power-of-a-blockchain-based-supply-chain) 7

            1.  [Open bazaar](#_bookmark16) 7

            2.  [OpenSea NFT Marketplace](#_bookmark17) 8

3.  [Concept and Design](#concept-and-design) 9

    1.  [Design goals](#design-goals) 9

        1.  [Enhanced Traceability](#enhanced-traceability) 9

        2.  [Automation](#automation) 9

        3.  [Transparency](#transparency) 10

    2.  [How the Decentralized Marketplace
        works](#how-the-decentralized-marketplace-works) 10

        1.  [Stakeholders](#stakeholders) 10

        2.  [Transactions](#transactions) 10

        3.  [Bidding](#bidding) 10

        4.  [Wallets](#wallets) 11

    3.  [Decentralized Supply Chain
        Model](#decentralized-supply-chain-model) 12

        1.  [Traceability through Verifiable
            credentials](#traceability-through-verifiable-credentials)
            12

    4.  [Operational Workflow of the Decentralized
        Marketplace](#operational-workflow-of-the-decentralized-marketplace)
        13

        1.  [Security Measures in the Decentralized
            Marketplace](#security-measures-in-the-decentralized-marketplace)
            15

4.  [Implementation](#implementation) 17

    1.  [Technology stack](#technology-stack) 17

    <!-- -->

    1.  [Architecture of the Decentralized
        Marketplace](#architecture-of-the-decentralized-marketplace) 18

    2.  [Contract Design](#contract-design) 19

xii Contents

3.  [User Interface](#user-interface) 22

    1.  [Seller screen](#seller-screen) 22

    2.  [Buyer screen](#buyer-screen) 23

    3.  [Distributor screen](#distributor-screen) 23

4.  [Implementation of VC storage](#implementation-of-vc-storage) 23

5.  [Smart Contract Addresses and GitHub
    Repository](#smart-contract-addresses-and-github-repository) 24

<!-- -->

5.  [Evaluation](#evaluation) 27

    1.  [Research questions](#research-questions) 27

    2.  [Ethereum Cost Analysis](#ethereum-cost-analysis) 28

    3.  [Discussion](#discussion) 29

6.  [Conclusion](#conclusion) 31

[List of Tables](#list-of-tables) 33

[List of Figures](#list-of-figures) 35

[Bibliography](#bibliography) 37

[Appendices](#appendices) 41

## Introduction

> Modern supply chains involve a range of logistical operations,
> including planning, executing, and managing the flow and storage of
> goods, services, and information from their origin to the final
> customer. However, achieving these outcomes has become increasingly
> difficult due to the growing complexity of supply chains
> [\[1\].](#_bookmark59)
>
> Furthermore, the European Union has also introduced several policies
> aimed at improv- ing supply chain transparency and
> [sustainability\[2\].](#_bookmark60) For instance, Regulation (EU)
> 2024/1252 requires large companies, by 24th May 2025, to map and
> assess their supply chains for strate- gic raw materials. These
> companies must identify risks and vulnerabilities, thereby ensuring
> accountability for secure and sustainable
> sour[cing\[3\].](#_bookmark61) This reflects the EU's commitment to
> fostering responsible and transparent supply chains in critical
> sectors.
>
> Blockchain's decentralized nature offers a promising solution to these
> challenges. Given blockchain's unique capabilities, exploring its
> applications in supply chains is important for academics and
> practitioners.
>
> In this project, we test the boundaries of smart contracts to
> establish a fully autonomous and decentralized marketplace that
> independently manages all business logic. Through these smart
> contracts, we aim to create a truly independent platform, fully
> governed by code, enhancing both security and trust for all
> participants. Our marketplace connects all key stakeholders within a
> supply chain into a single decentralized system. This setup is
> intended to make supply chain management easier.
>
> Through the use of blockchain's public transaction records, we
> designed a system that traces each product's origin, helping to
> prevent counterfeit goods and hold companies accountable. This
> transparent approach makes it possible to verify the authenticity of
> products and ensures that raw materials are sourced ethically and
> responsibly. By recording every step in the supply chain on an open
> ledger, our system promotes trust and encourages higher standards in
> both sourcing and production practices.
>
> While blockchain technology still faces challenges, such as high gas
> fees, scalability limi- tations [\[4\],](#_bookmark62) energy
> consumption, and lengthy transaction times [\[5\],](#_bookmark63) we
> evaluate whether it is feasible to implement a decentralized system
> under these constraints. Specifically, we assess the actual costs
> users encounter in a blockchain-based supply chain model and
> understand if these challenges significantly impact its practicality.
>
> To address the challenges facing modern supply chains, we propose a
> decentralized solu- tion that leverages blockchain's decentralized
> structure and the security and trust provided by escrow smart
> contracts. This approach aims to answer three key questions: Can a
> blockchain- based system enable a fully independent and decentralized
> supply chain? Does blockchain technology guarantee complete
> traceability throughout the supply chain? And finally, is a
> blockchain-driven supply chain more cost-efficient than current
> systems? By integrating these
>
> **2** *Chapter 1. Introduction*
>
> technologies, we aim to create a more transparent, efficient, and
> secure supply chain model.

## Related Work

> This chapter defines and explains the key concepts, terms, and
> technologies essential for under- standing the thesis. It also
> contains a literature review section where we take a look at related
> papers.

### Distributed Ledger Technology (DLT)

> Distributed ledger technology is a term used to describe technologies
> used for the storage, distribution, and exchange of data between users
> over a distributed computer network. It is a database that is spread
> and stored over multiple computers(nodes) located at physically
> different locations. In simple terms, it is a datasheet stored on
> multiple distributed [nodes\[6\].](#_bookmark64) DLTs can be split
> into three categories, Blockchain, Directed Acyclic Graphs(DAG), and
> hybrid DLT. In this work, we will be focusing on Blockchain.

### Blockchain

> The concepts of bitcoin and blockchain were first introduced in 2008
> by the pseudonymous Satoshi Nakamoto, who demonstrated how
> cryptography and an open distributed ledger could be utilized to
> create a digital curr[ency\[7\].](#_bookmark65) Blockchain is a
> decentralized database of transaction records, validated and
> maintained by a global network of computers. Unlike traditional cen-
> tralized databases controlled by a single authority, blockchain
> records are overseen by a com- munity, ensuring no individual can
> alter or erase transaction histories. This distributed nature makes
> the information tamper-proof, as opposed to a centralized database
> that resides within a single entity. Blockchain operates on a
> peer-to-peer network, where every user can access all entries,
> preventing any single entity from gaining control. When a transaction
> is made, it is ver- ified by computer algorithms and then added to a
> chain of previous transactions, forming the blockchain. Bitcoin is a
> prominent example, utilizing this technology to facilitate the mining,
> storing, and trading of bitcoins through a complex algorithm within a
> distributed [network\[8\].](#_bookmark66) Beyond its origins in
> digital currency, blockchain technology has expanded its applications
> into various fields such as finance, healthcare, supply chain
> management, market monitoring, smart energy, and copyright
> pr[otection\[7\].](#_bookmark65)

#### Technical Overview of Blockchain

> Blockchain technology operates on a decentralized database concept,
> where identical copies of the database exist on multiple computers,
> ensuring security and resilience against hacking. This decentralized
> structure contrasts with the centralized databases used by
> organizations, which are more vulnerable to attacks. Blockchain can be
> seen as a peer-to-peer network run-

4.  *Chapter 2. Related Work*

> ning atop the internet, offering enhanced security through its
> architectur[e\[8\].](#_bookmark66)
>
> In blockchain, data integrity is maintained through a decentralized
> ledger that records trans- actions in a tamper-proof manner.
> Transactions are grouped into blocks, cryptographically linked to form
> a chain. Each transaction must go through a validation process before
> being deemed legitimate. The process of validating transactions,
> organizing these validated transac- tions into blocks, and adding them
> to the blockchain is called [mining\[8\].](#_bookmark66) Satoshi
> Nakamoto introduced proof of work (PoW) to build a distributed
> trustless consensus and resolve the double-spend problem. There are
> two primary algorithms, PoW (Proof-of-work) and PoS (Proof-of-stake)
> through which Blockchain [operates\[9\].](#_bookmark67)

### Ethereum

> Ethereum is a major blockchain that launched in 2015, it creates a
> universal blockchain-based application plat[form\[10\].](#_bookmark68)
> Ethereum is a Turing complete blockchain platform optimized for
> executing smart contracts, which are rules that automatically carry
> out actions when specific conditions are met. Anyone can be an
> Ethereum node on their machine to participate in the Ethereum
> blockchain [network\[11\].](#_bookmark69)
>
> Ethereum's purpose is to offer an alternative protocol for building
> decentralized applica- tions. It achieves this by providing a
> blockchain with a built-in Turing-complete programming language,
> enabling the creation of smart contracts and decentralized
> applications with custom rules for ownership, transaction formats, and
> state [transitions\[12\].](#_bookmark70)

#### Technical Overview Of Ethereum

> The Ethereum state is made up of objects called \"accounts\", each
> account has a 20-byte address and state transitions being a direct
> transfer of value and information between
> [accounts\[13\].](#_bookmark71) There are two types of accounts:

- Externally owned accounts (EOAs): Controlled by private keys.

- Contract accounts: Controlled by smart contracts deployed on the
  [blockchain.\[10\]](#_bookmark68) This account contains four fields:

- Nonce: a counter used to ensure each transaction can only be processed
  once

- Balance: The current ether balance

- contract code(if present)

- Storage(empty by default)

> To verify transactions Ethereum previously used proof of work but on
> 15 September 2022, the Ethereum network switched to the proof of stake
> consensus [mechanism.\[14\]](#_bookmark72)

#### Gas cost

> To mitigate Denial-of-Service (DoS) attacks caused by excessive
> computation, Ethereum imple- mented a gas system that restricts the
> amount of computational, memory, and storage resources a single smart
> contract can consume [\[15\].](#_bookmark73) The Ethereum Virtual
> Machine (EVM) is a computa-

4.  *Smart Contracts* **5**

> tion engine that powers all smart contracts (SCs) on the Ethereum
> network. It operates using 256-bit words and is Turing Complete,
> meaning it can execute any computation given enough resources,
> allowing for complex, programmable logic to be deployed within
> Ether[eum\[16\].](#_bookmark74) Gas costs in Ethereum are tied to the
> execution of instructions within the Ethereum Virtual Machine (EVM).
> Generally, EVM operations that increase the blockchain's size, such as
> updating state variables, deploying new contracts, or emitting events
> are particularly costly. This is in addi- tion to the base gas cost
> required for any transaction, which covers basic
> pr[ocessing\[15\].](#_bookmark73)
>
> Gas costs are a crucial factor in our system, as each transaction
> incurs a cost in ETH for the user. We will explore this in greater
> detail in the Evaluation section, where we analyze the impact of gas
> fees on system performance and user experience.

### Smart Contracts

> Blockchain-powered smart contracts have evolved significantly, with
> platforms like Ethereum enabling customizable programming logic in a
> decentralized manner. Smart contracts are self- executing agreements
> between parties, written as program codes on a blockchain, which fa-
> cilitates transactions without a central authority
> [\[17\].](#_bookmark75) Smart contracts are pieces of executable code
> that operate on the blockchain, facilitating, executing, and enforcing
> agreements between parties who may not trust each other, without
> relying on a trusted intermediary. These con- tracts introduced
> automation to the network and allowed for the digitization of
> traditional paper contracts. Unlike conventional agreements, smart
> contracts allow users to encode their agreements, enabling automated
> transactions without the need for oversight from a central au-
> thority. By automating processes through computers and blockchain
> services, the potential for human error is also minimized, reducing
> the likelihood of disputes over contracts [\[18\].](#_bookmark76)

#### Escrow smart contracts

> The Cambridge English Dictionary [\[19\]](#_bookmark77) defines escrow
> as \"an agreement between two people or organizations in which money
> or property is kept by a third person or organization until a
> particular condition is met\". This description aligns perfectly with
> the function of escrow smart contracts. In a buyer-seller transaction,
> the seller initiates the smart contract to securely hold the funds for
> the product. The buyer then deposits the payment into the contract,
> and once the product is delivered and accepted, the funds are released
> to the seller [\[20\].](#_bookmark78)

### IPFS

> The InterPlanetary File System, IPFS is a decentralized file-sharing
> platform that identifies files through their content. It relies on a
> distributed hash table (DHT) to retrieve file locations and node
> connectivity [information\[21\].](#_bookmark79) IPFS introduces a new
> platform for developing and de- ploying applications, as well as a
> system for distributing and versioning large datasets. Being a
> peer-to-peer system, IPFS treats all nodes equally, without any
> centralized authority. Nodes store IPFS objects locally and connect
> with other nodes to exchange these objects, which can represent files
> or various other data structur[es\[22\].](#_bookmark80) IPFS is useful
> in blockchain applications because not all data needs to be stored
> [on-chain\[23\].](#_bookmark81)
>
> **6** *Chapter 2. Related Work*

### Supply Chain

> A supply chain may be defined as an integrated process wherein several
> various business en- tities (i.e. suppliers, manufacturers,
> distributors, and retailers) work together to (1) acquire raw
> materials, (2) convert these raw materials into specified final
> products, and (3) deliver these final products to retailers
> [\[24\].](#_bookmark82) The manufacturing industry plays a key role in
> generating wealth by adding value and selling products. A critical
> aspect for all manufacturing compa- nies is managing the flow of
> materials from suppliers, through value-adding processes, and
> eventually through distribution channels to reach customers. The
> supply chain is a network of interconnected activities focused on
> planning, coordinating, and controlling the movement of materials,
> components, and finished products from suppliers to customers
> [\[25\].](#_bookmark83) Figure [2.1](#_bookmark12) shows a basic
> supply chain with all the relevant [stakeholders\[24\].](#_bookmark82)

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image6.png){width="3.0847911198600175in"
height="1.1725in"}

> []{#_bookmark12 .anchor}**Figure 2.1:** Basic supply chain process.

### Decentralized supply chain

> Our implementation of a decentralized supply chain heavily depends on
> a decentralized mar- ketplace to establish a platform that directly
> connects buyers(retailers), sellers(suppliers), and distributors
> without the need for a central authority or intermediary. This
> approach enhances data security, privacy, and ownership while reducing
> intermediary costs, making it ideal for online marketplaces.
> Traditional platforms charge fees that hurt buyers and sellers,
> whereas a decentralized blockchain-based marketplace doesn't directly
> charge fees(only gas costs) and gives users control over their data.
> Unlike centralized systems that can compromise user infor- mation,
> such as the 2014 eBay breach affecting 145 million users,
> decentralized systems allow individuals to secure their data,
> eliminating single points of failur[e\[26\].](#_bookmark84) In
> addition, blockchain enhances transparency by allowing users to trace
> the origin and journey of products, ensuring authenticity and reducing
> [fraud\[27\].](#_bookmark85)

### Literature Review

> This section provides an overview of relevant works and examines their
> approaches to de- centralizing supply chains. Several projects have
> already recognized blockchain as a trans- formative technology for
> supply chain management, offering new solutions for transparency,
> traceability, and efficiency across various industries
> [\[28\].](#_bookmark86)

8.  *Literature Review* **7**

#### The Power of a Blockchain-based Supply Chain

> In the paper titled \"The Power of a Blockchain-based Supply Chain\"
> by Azzi et al [\[28\],](#_bookmark86) the authors explore how
> blockchain technology enhances transparency, security, and efficiency
> in supply chains. The paper highlights how traditional centralized
> systems are vulnerable to fraud, data tampering, and inefficiencies.
> Blockchain, with its decentralized and immutable nature, can mitigate
> these issues by providing a secure, tamper-proof system that enhances
> traceability across various industries such as food and
> pharmaceuticals.
>
> The paper discusses two case studies that demonstrate the practical
> application of blockchain in supply chains. Ambrosus a Swiss start-up,
> focuses on ensuring the safety and quality of food and pharmaceuticals
> by using blockchain and sensors. Modum another Swiss start-up, on the
> other hand, specializes in pharmaceutical logistics and ensures
> compliance with regulatory standards for safe delivery. Both systems
> integrate blockchain for transparency and real-time monitoring,
> improving supply chain efficiency.
>
> Despite its advantages, blockchain faces scalability challenges,
> particularly in handling large amounts of data. Solutions like
> InterPlanetary File System (IPFS) and other distributed storage
> systems are proposed to complement blockchain's capabilities. The
> authors also discuss issues of blockchain immaturity, especially
> related to synchronization and data management.
>
> In conclusion, the literature shows that blockchain-based supply
> chains bring several advan- tages, including enhanced transparency,
> better data security, and improved traceability. How- ever,
> implementing blockchain in supply chains requires overcoming
> technological challenges. The authors argue that as blockchain
> technology matures, it will play an increasingly critical role in
> creating efficient and secure supply chains.

1.  []{#_bookmark16 .anchor}Open bazaar

> J. E. Arps et al [\[29\],](#_bookmark87) explore the decentralized
> peer-to-peer marketplace, OpenBazaar, which was initially envisioned
> as a response to the takedown of Silk Road. The authors monitored the
> platform for over 14 months, collecting data from 6,651 unique
> participants. Despite the decentralized nature of the platform,
> OpenBazaar has not seen significant adoption, with only around 80
> active users per day and over half of its participants using the
> platform for less than a day.
>
> Most of the economic activity observed involved illicit products, and
> only a small fraction of users were responsible for documented sales.
> The marketplace supports legal products, but vendors selling drugs or
> other illegal items generate the majority of sales revenue. Security
> is- sues were also identified, as some users inadvertently leaked
> their IP addresses, compromising their anonymity.
>
> The study highlights several reasons for OpenBazaar's limited success,
> including a high learning curve for new users, insufficient
> integration of privacy features, and low demand for decentralized
> marketplaces compared to centralized alternatives. While the platform
> shows potential, these issues have prevented it from achieving the
> envisioned transformation of e- commerce.
>
> **8** *Chapter 2. Related Work*

2.  []{#_bookmark17 .anchor}OpenSea NFT Marketplace

> B. White et al [\[30\]](#_bookmark88) explore the role of OpenSea as a
> decentralized NFT marketplace. In decen- tralized supply chains,
> platforms like OpenSea remove intermediaries, enabling direct owner-
> ship transfers between parties through smart contracts. These
> contracts govern the creation, or minting, of NFTs, ensuring metadata,
> ownership, and all future transactions are securely recorded on the
> blockchain. Operating autonomously, OpenSea allows users to interact
> and trade under rules set by the code, without relying on centralized
> authorities, highlighting its efficiency and security in digital asset
> trading.
>
> Moreover, the use of blockchain for NFTs in OpenSea highlights some
> key elements of a decentralized supply chain: traceability,
> immutability, and security. Just like in physical sup- ply chains
> where tracking and verifying the authenticity of goods is crucial,
> OpenSea show- cases how blockchain technology ensures that every
> transaction can be traced back to its origin. Ownership records on the
> blockchain remain tamper-proof, guaranteeing security and reduc- ing
> fraud, which aligns with blockchain's role in improving transparency
> and trust in supply chains.
>
> However, challenges persist, as noted in the literature. Decentralized
> marketplaces often face scalability issues and concerns related to
> energy consumption on proof-of-work blockchains. Despite these
> hurdles, OpenSea represents an example of how decentralized platforms
> can fos- ter more efficient, transparent, and reliable transactions,
> setting the stage for broader blockchain adoption in supply chain
> [management\[30\].](#_bookmark88)

## Concept and Design

> To create a decentralized supply chain using escrow smart contracts we
> designed a decentral- ized marketplace. This marketplace connects
> sellers, buyers, and distributors directly to one another cutting out
> any form of intermediaries. Transactions are handled by escrow smart
> contracts to make these transactions as transparent and secure as
> possible

### Design goals

> Moving away from the standard centralized supply chain comes with a
> number of benefits. In this section, We aim to highlight some of the
> possible advantages that motivated this project.

#### Enhanced Traceability

> Traceability refers to the ability to track and document the history
> and origin of an entity, ei- ther within an organization or beyond.
> The process varies depending on the industry and the type of product.
> In manufacturing and processing, traceability typically starts from
> the source of each raw material or component and continues through
> transportation, production, and packaging, until it reaches the final
> [customers\[31\].](#_bookmark89) Blockchain has already been incorpo-
> rated into many supply chains to establish traceability. On public
> blockchains like Bitcoin and Ethereum, every transaction is recorded
> in a transparent, immutable ledger, allowing anyone in the network to
> view the entire transaction history [\[32\]\[27\].](#_bookmark85) The
> basic idea is to allow any stakeholder in the supply chain to verify
> previous transactions between other stakeholders by simply verifying
> if that transaction exists on the blockchain. The primary objective of
> enhanc- ing traceability is to battle the counterfeit market, empower
> end users with the ability to track the conditions under which each
> stage of production occurs, and ultimately hold companies accountable
> for the integrity of their products.

#### Automation

> One of the primary advantages of escrow smart contracts is the
> elimination of intermediaries, such as banks or third-party verifiers.
> By automating financial transactions and contract en- forcement,
> escrow smart contracts facilitate secure payments and exchanges
> without the need for costly middlemen, significantly reducing
> operational costs and [delays\[33\]\[34\].](#_bookmark92)

9

> **10** *Chapter 3. Concept and Design*

#### Transparency

> With smart contracts, all stakeholders gain access to the contract's
> logic before committing to any transactions, ensuring clarity and
> confidence in how the system will operate under various scenarios. For
> instance, buyers can thoroughly review a seller's refund policies
> embedded within the smart contract before purchasing a product. This
> provides a level of certainty that, in case of a refund request, the
> smart contract will execute according to the predefined rules without
> bias. In traditional supply chains, buyers often rely on the
> discretion of sellers to determine whether a refund will be granted,
> leading to uncertainty

### How the Decentralized Marketplace works

> In this section, we highlight the structure and functionality of the
> decentralized marketplace.

#### Stakeholders

> In the decentralized marketplace, three primary stakeholders drive the
> core operations: the Seller, the Distributor, and the Buyer. Each
> plays a crucial role in ensuring seamless transactions and efficient
> delivery of products, facilitated by blockchain technology.

- **[Seller]{.underline}**: The seller initiates the process by listing
  a product on the decentralized platform. They have full control over
  setting the price and managing the product's availability. Once the
  product is listed, the seller's responsibility extends to choosing the
  most suitable distributor, ensuring the product reaches the buyer
  securely.

- **[Distributor]{.underline}**: Distributors play a vital logistical
  role in the system, responsible for deliv- ering products from sellers
  to buyers. Multiple distributors can bid for the delivery of a
  package, and the seller has the flexibility to select the one that
  best fits their needs, whether based on price, speed, or reliability.

- **[Buyer]{.underline}**: Buyers can search for and purchase products
  on the marketplace, enjoying direct access to sellers. Once a purchase
  is made, the buyer is connected to the seller, who then selects a
  distributor to fulfill the delivery.

#### Transactions

> All transactions in the system happen over escrow smart contracts. For
> every product added to the decentralized marketplace a smart contract
> is created. The seller creates a smart contract to add the product to
> the marketplace, this smart contract handles all transactions for this
> product and keeps track of all the stakeholders and their role in the
> sale and purchase of the product.

#### Bidding

> Over the past decade, online auctions have redefined consumer choices
> for purchasing. How- ever, one major drawback of online auctions is
> their reliance on centralized systems and third- party services to
> facilitate communication and financial transactions between sellers
> and bid- ders. These intermediaries can introduce additional
> transaction and overhead costs, making

2.  *How the Decentralized Marketplace works* **11**

> the process more expensive. Furthermore, the centralized storage of
> transaction records and personal data of bidders poses risks such as
> data manipulation, loss, and privacy breaches, as this sensitive
> information is more vulnerable to exploitation in a single-point
> system [\[35\].](#_bookmark93) The challenges of online auctions can
> be effectively resolved by implementing blockchain tech- nology, a
> decentralized system. Blockchain-based auctions eliminate
> intermediaries, which reduces transaction costs while fostering trust
> among all participants [\[35\].](#_bookmark93) Smart contracts allow
> business rules and logic agreed upon by participants to be encoded in
> the contract, auto- matically executing when predefined conditions are
> met. These smart contracts can streamline complex procedures such as
> bidding by automatically transferring ownership once the bidding
> process [ends\[36\].](#_bookmark94) In our decentralized marketplace,
> a straightforward bidding system is used to facilitate the selection
> of distributors by sellers. Distributors are able to view available
> prod- ucts requiring delivery, along with the distance between the
> buyer and seller. They then submit bids specifying their delivery
> charges. Once a seller selects a distributor, the seller deposits the
> delivery fee into the smart contract. Upon successful delivery, the
> smart contract releases the fee to the distributor.

#### Wallets

> Cryptocurrency wallets (or crypto-wallets) are essential for
> interacting with blockchain plat- forms. Anyone wishing to use
> blockchain for transactions must have a crypto-wallet. Crypto wallets
> allow users to create accounts by generating a pair of private and
> public keys, which are stored in the wallet software. To initiate a
> transaction on the blockchain, users sign over ownership of their
> coins using the wallet's address. Funds are spent by unlocking them
> with the keys stored in the wallet. There is no physical transfer of
> coins; rather, transaction data is exchanged on the blockchain,
> reflecting the change in balance in the user's
> [crypto-wallet\[37\].](#_bookmark95)

##### MetaMask

> MetaMask is an incredibly useful tool that plays a crucial role in
> helping you get started with blockchain technology. It enables you to:

- Create accounts for use across different Ethereum networks.

- Manage the private keys for your accounts, allowing you to export them
  or import other accounts.

- Seamlessly switch between Ethereum networks, so your account balances
  are updated for each network.

- Conduct transactions between accounts, such as transferring Ether from
  one account to another.

- Hold tokens within your MetaMask accounts.

- View detailed transaction histories via Etherscan, a blockchain
  explorer.

> Beyond being just a crypto-wallet, MetaMask also facilitates
> interaction with the Ethereum blockchain by injecting a JavaScript
> library called web3.js, developed by the Ethereum core
> [team\[38\].](#_bookmark96) MetaMask simplifies the account creation
> process for our system by providing each user with an Ethereum
> address, which the system uses to identify the user and their role.
> For instance, when a seller creates a product, their Ethereum address
> is linked to it, granting them exclusive permissions to execute
> specific smart contract functions that only the seller can access.
>
> **12** *Chapter 3. Concept and Design*

### Decentralized Supply Chain Model

> With the integration of the seller, buyer, and distributor the
> decentralized marketplace creates a decentralized supply chain. A
> buyer can add value to a product and become the seller to the next
> buyer over the decentralized marketplace.

#### Traceability through Verifiable credentials

> Verifiable Credentials (VCs) are a digital equivalent of traditional
> physical credentials, such as a driver's license or passport, which
> allow users to present trusted information in a secure,
> privacy-preserving, and cryptographically verifiable way. The
> cryptographic signatures in- volved make VCs tamper-evident and
> trustworthy for verifiers, ensuring both the authenticity and privacy
> of the credential [data\[39\].](#_bookmark97)
>
> In the context of the proposed system, each product will have an
> associated VC, digitally signed by both the buyer and the seller,
> allowing for verification by third parties. These VCs will be stored
> on a decentralized network like IPFS and linked to form a chain,
> wherein one VC can reference a previous one. This chaining mechanism
> is especially useful in supply chains, enabling each product's VC to
> point to the VCs of its components, thus ensuring traceability and
> transparency throughout the production process.
>
> For example, in the supply chain of electric vehicle (EV) batteries,
> Lithium-ion batteries (LIBs) are currently the leading energy storage
> systems in Battery electric vehicles(BEVs) and are projected to grow
> significantly in the foreseeable future. They are composed of a
> cathode, usually containing a mix of lithium, nickel, cobalt, and
> manganese; an anode, made of graphite; and an electrolyte, comprised
> of lithium salts. Aluminum and copper are also major materials present
> in the pack [components\[40\].](#_bookmark98)

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image7.jpeg){width="6.97in"
height="3.160416666666667in"}

> []{#_bookmark30 .anchor}**Figure 3.1:** Decentralized SupplyChain

4.  *Operational Workflow of the Decentralized Marketplace* **13**

> In Fig. [3.1,](#_bookmark30) the diagram illustrates an abstract
> representation of the integration of a decentral- ized marketplace to
> establish a decentralized supply chain for EV batteries. In this
> system, the EV battery manufacturer connects to various suppliers
> through the marketplace. Each trans- action that the EV battery
> manufacturer engages in with these suppliers is secured through
> Verifiable Credentials (VCs), which serve as a digital receipt signed
> by both the seller and the battery manufacturer as the buyer. This
> verifiable credential confirms the authenticity of the transaction.
>
> As the supply chain progresses, the battery manufacturer transitions
> from being a buyer of raw materials to a seller of finished
> products(EV batteries). The battery manufacturer generates new VCs for
> each battery produced, linking them to the prior VCs of the raw
> materials (nickel, cobalt, and lithium). Each VC in this chain
> contains important metadata, such as the transaction hash associated
> with the payment for the material, as well as the signatures from both
> the buyer and the respective supplier. This enables buyers of EV
> batteries to trace the origin of all raw materials used, verify proof
> of payment, and even access the smart contract that governs the
> transaction.
>
> This architecture of VC chaining not only ensures that the provenance
> of materials can be verified, but also enhances transparency across
> the supply chain by providing proofs of each transaction. This system
> is particularly valuable in industries where environmental and ethical
> concerns around sourcing are paramount, as it allows stakeholders to
> trace and verify every step of the manufacturing process with
> precision and trust.

### Operational Workflow of the Decentralized Marketplace

> Figure [3.2](#_bookmark32) illustrates the flow of the proposed
> Decentralized Marketplace, breaking down the process into seven
> stages.

##### Stage 1

> The process begins with the seller creating a product on the
> decentralized marketplace. The seller sets the price. Once the product
> is listed, it becomes visible to potential buyers on the marketplace.

##### Stage 2

> The buyer searches for a product they wish to purchase. If satisfied,
> the buyer can proceed by depositing the product's price and placing
> their order.

##### Stage 3

> Once the buyer deposits the product price, the seller can update the
> product's buyer field in the verifiable credentials (VC) with the
> buyer's address. The seller then confirms the order and uploads the
> updated VC to IPFS. The buyer is notified that the order has been
> confirmed and can now view the VC on IPFS.

##### Stage 4

> Once a product is listed for sale and a buyer makes a deposit, the
> product is moved to the dis- tributor page. Here, distributors can
> view all the items requiring transportation and place bids
>
> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image8.jpeg){width="4.99125in"
> height="6.11625in"}**14** *Chapter 3. Concept and Design*
>
> []{#_bookmark32 .anchor}**Figure 3.2:** Decentralized Marketplace
> Flowchart.
>
> for their delivery fees. Distributors must also make a security
> deposit equal to the product's price. This deposit ensures they
> fulfill the delivery obligation, if they fail to deliver the product,
> they forfeit their deposit.

##### Stage 5

> Sellers then choose a distributor to transport the product based on
> the delivery price and the distributor's profile, which includes their
> track record from previous deliveries. Once a distrib- utor is
> selected, the seller deposits the delivery fee, and all other
> distributors have their security deposits refunded.

4.  *Operational Workflow of the Decentralized Marketplace* **15**

##### Stage 6

> The selected distributor then picks up the product and delivers it to
> the buyer.

##### Stage 7

> Once the product is delivered, the buyer confirms receipt by clicking
> the \"Confirm Delivery\" button. After confirmation, the smart
> contract releases all funds: the product price is trans- ferred to the
> seller, the delivery fee is paid to the distributor, and the
> distributor's security deposit is returned. By clicking confirm
> delivery the VC is also signed by the buyer making the VC complete
> with both the buyer and seller signatures. The final VC is uploaded to
> IPFS and the seller is notified of where to access it

#### Security Measures in the Decentralized Marketplace

> To ensure fairness and prevent any stakeholder from exploiting the
> system, the Decentralized Marketplace incorporates several security
> measures through the use of smart contracts. One of the key advantages
> of a decentralized system and smart contracts is their ability to
> operate autonomously, enabling parties to agree on predefined rules
> that are automatically enforced when specific conditions are met. The
> security measures in place include timers and penalties, designed to
> uphold integrity at each stage of the process. Let's take a closer
> look at how these measures function throughout the different stages.

##### Stage 3

> Once the buyer deposits the product price, a timer is triggered. The
> seller then has two days to confirm the order and upload the product's
> verifiable credentials (VC). If the seller fails to do so within this
> 48-hour window, the buyer's deposit is automatically refunded, and the
> product is removed from the marketplace. This approach ensures that
> the process remains efficient and prevents buyer funds from being
> unnecessarily locked in the escrow smart contract.

##### Stage 4

> In stage 4, the security protocol mirrors that of stage 3. Once the
> order is confirmed, the product is ready for delivery, and the next
> step is to find a distributor. Distributors have two days to submit
> bids for the delivery fee. If no distributor is found within these 48
> hours, the product is removed from the marketplace, and the buyer is
> refunded. The rationale behind this is that if no distributor bids
> within the two-day window, the product may not be viable for delivery,
> and thus it is removed from the marketplace to keep the process
> efficient. Distributors are required to provide a security deposit
> equivalent to the product's cost price. This measure ensures that, as
> independent participants, distributors are incentivized to complete
> the delivery. If they fail to do so, they risk forfeiting their
> deposit. This mechanism also discourages any attempt to steal the
> product, as the financial loss from the forfeited deposit outweighs
> the potential gain.

##### Stage 5

> In stage 5, another 48-hour timer is triggered once the first
> distributor places a bid. The seller now has two days to select one of
> the bidding distributors. If the seller fails to make a selection
> within this time frame, the product is removed from the marketplace,
> and all parties(the buyer and distributors) are refunded. This ensures
> that the process remains timely and prevents delays or funds being
> unnecessarily held.
>
> **16** *Chapter 3. Concept and Design*

##### Stage 6

> In stage 6, penalties come into play based on the distributor's
> security deposit. Since the dis- tributor deposited the product's
> cost, deductions are made if there are delays. For each day the
> distributor fails to deliver the product beyond the agreed-upon date,
> 10% of the security deposit is awarded to the buyer. If the product is
> not delivered within 10 days after the agreed date, the buyer is fully
> refunded, preventing the distributor from benefiting by withholding
> the package.

##### Stage 7

> If, upon delivery, the buyer refuses to confirm delivery, the
> distributor must inform the seller and provide evidence, such as
> showing proof of being at the buyer's location. The seller then has
> the option to cancel the delivery. Once the product is returned to the
> seller, the distributor's security deposit is refunded, the
> distributor's delivery fee is deducted from the buyer's deposit, and
> the remaining funds are returned to the buyer.
>
> Since the distributor must return the product to the seller at the
> same fee as the initial deliv- ery, they are effectively doing twice
> the work for the same pay, which discourages any abuse of the system.
> The seller also has no incentive to misuse the cancellation option, as
> they do not receive payment. Similarly, the buyer is discouraged from
> refusing to confirm the delivery, as they would still be responsible
> for the distribution fee. This setup ensures a balanced system where
> all parties are held accountable.

## Implementation

> This chapter describes the implementation of the decentralized
> marketplace. The implementa- tion builds on the design principles
> outlined in the previous chapter and focuses on the tech- nical
> aspects of creating a secure and automated supply chain solution using
> blockchain tech- nology.

#### Technology stack

> The decentralized marketplace was implemented using a variety of
> blockchain tools to ensure efficient and secure operation. Below is a
> detailed overview of the key tools used in the imple- mentation:

##### Ethereum

> We used Ethereum to host the smart contracts and track transactions.

##### Truffle

> Truffle is a development framework for Ethereum that simplifies the
> process of writing and testing smart [contracts\[41\].](#_bookmark99)
> We used Truffle to manage the development lifecycle of the smart
> contracts.

##### Web3.js

> Web3.js is a JavaScript library that enables interaction with the
> Ethereum blockchain from a web [interface\[42\].](#_bookmark100) In
> our implementation, Web3.js was used to connect the front-end
> interface to the blockchain, allowing users (buyers, sellers, and
> distributors) to interact with the smart contracts. It facilitated
> functions like sending transactions, reading contract states, and han-
> dling blockchain events within the user's browser.

##### Solidity

> Solidity is a statically typed, contract-oriented programming language
> designed for writing smart [contracts\[43\].](#_bookmark101) The smart
> contracts were implemented in Solidity, leveraging its features for
> handling complex financial transactions, access control, and event
> emissions.

##### MetaMask

> MetaMask is a crypto wallet that allows users to create accounts for
> blockchain networks, switch between various networks, and perform
> transactions between accounts [\[38\].](#_bookmark96) The Meta- Mask
> browser extension was integrated into the project to enable users to
> seamlessly manage their Ethereum accounts. It provides a simple
> interface for users to securely manage their keys and funds.

##### Ganache

> Ganache is a personal blockchain used to deploy smart contracts
> locally and simulate blockchain transactions [\[41\].](#_bookmark99)
> During development, Ganache provided a controlled environment where
> the smart contract could be tested before deploying it to the Ethereum
> testnet. This allowed for

17

> **18** *Chapter 4. Implementation*
>
> rapid testing and debugging of contract functions without incurring
> real Ether costs.

##### Sepolia

> Sepolia is an Ethereum testnet used for testing smart contracts in a
> real-world environment without using actual Ether. After the contract
> was tested locally on Ganache, it was deployed to the Sepolia testnet
> to test its functionality in a more realistic blockchain setting.

##### Pinata.cloud

> Pinata is a Web3 media platform that provides a user interface for
> storing, managing, and distributing digital assets using
> IP[FS\[44\].](#_bookmark102) In this project, Pinata was used to store
> Verifiable Credentials(VCs) containing product credentials. Pinata
> ensures that this data is immutable and publicly accessible,
> maintaining the decentralized nature of the marketplace.

### Architecture of the Decentralized Marketplace

> The decentralized marketplace is composed of four key layers, each
> working together to ensure seamless functionality. These layers
> include the Blockchain Layer, IPFS Layer, Decentralized Application
> (dApp) Layer, and User Layer as seen in Figure [4.1.](#_bookmark37)

##### User Layer

> This layer represents the end-users who interact with the system in
> one of three primary roles: Seller, Buyer, or Distributor. These
> stakeholders use the marketplace to perform various oper- ations, such
> as purchasing products, selling items, or distributing goods.

##### Decentralized Application (dApp) Layer

> The dApp layer serves as the interface between the user and the
> underlying blockchain. Utiliz- ing web3.js and MetaMask, this layer
> enables secure interactions with the blockchain. Through it, users can
> transfer Ethereum (ETH) between wallets, call smart contract
> functions, and par- ticipate in other decentralized operations, all
> through a user-friendly interface.

##### Distributed Storage Layer

> This layer is responsible for storing data in a decentralized and
> secure manner. Currently, it is used to store Verifiable Credentials
> (VCs) related to products, ensuring that all product information is
> tamper-proof and can be verified by relevant stakeholders. IPFS
> (InterPlanetary File System) is a component within this layer that
> facilitates decentralized file storage.

##### Blockchain Layer

> The Blockchain Layer manages all transactions, records transaction
> histories, and hosts the smart contracts that govern the interactions
> within the marketplace.

2.  ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image9.png){width="6.345in"
    height="6.83in"}*Contract Design* **19**

> []{#_bookmark37 .anchor}**Figure 4.1:** Architecture of Decentralized
> Marketplace

### Contract Design

> In the implementation of the decentralized marketplace, two key smart
> contracts were de- signed to handle the creation and management of
> product transactions [4.2.](#_bookmark39) These contracts are:
>
> **ProductFactory:** Responsible for creating new products and storing
> them.
>
> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image10.png){width="6.257811679790026in"
> height="4.609374453193351in"}**20** *Chapter 4. Implementation*
>
> []{#_bookmark39 .anchor}**Figure 4.2:** Smart Contract Interactions
>
> **ProductEscrow:** Manages the lifecycle of individual products,
> including the payment, deliv- ery, and interactions between buyers,
> sellers, and distributors.

##### ProductFactory Contract

> The ProductFactory contract serves as a product creation and
> management hub. Its primary role is to instantiate new products as
> instances of the ProductEscrow contract, ensuring that each product
> operates independently while maintaining a registry of all created
> products. The contract is responsible for managing the lifecycle of
> products from creation to potential inter- actions with buyers,
> sellers, and distributors.

##### Key Features of the ProductFactory Contract:

> **Product Creation**: The factory creates new instances of the
> ProductEscrow contract. Each product is initialized with a name,
> price, and the owner (the seller).
>
> **Product Registry**: The contract stores the addresses of all created
> product instances, allow- ing for easy retrieval and tracking of
> products in the decentralized marketplace.

2.  *Contract Design* **21**

##### Main Functions:

- **createProduct(string name, int price):** This function allows a
  seller to create a new prod- uct by specifying its name and price. It
  deploys a new instance of the ProductEscrow contract and stores its
  address in the product registry.

- **getProducts():** This function returns an array of addresses for all
  products created through the factory, allowing users to retrieve
  product information.

2.  **ProductEscrow Contract** The ProductEscrow contract governs the
    interactions around a spe- cific product. This includes tracking the
    product's state, facilitating payments, managing dis- tributors, and
    overseeing the confirmation of delivery. It acts as an escrow system
    that holds funds until the transaction is completed, ensuring that
    buyers and sellers fulfill their obliga- tions before funds are
    released.

##### Key Features of the ProductEscrow Contract:

> **Escrow Mechanism**: The contract ensures that funds are securely
> held in escrow until the product is delivered and confirmed by the
> buyer.
>
> **Distributor Management**: The contract supports the involvement of
> distributors who can register, place bids for delivery fees, and
> receive compensation for their services.
>
> **Purchase Management**: It manages the purchase process by accepting
> funds from the buyer, and handling delivery confirmations.

##### Main Functions:

- **depositPurchase():** This function allows the buyer to deposit Ether
  for the purchase of the product. Once the payment is made, the
  contract records the buyer's address and marks the product as
  purchased.

- **confirmDelivery():** After the product is delivered, the buyer calls
  this function to confirm receipt. The contract releases the funds to
  the seller and distributor, ensuring both parties are compensated.

- **cancelDelivery():** The seller can call this function to cancel the
  delivery. It refunds the buyer and distributor. It also refunds the
  seller's delivery fee and subtracts it from the buyer's deposit.

- **setdistributor():** The seller selects a distributor by calling this
  function, which links the distributor to the product.

- **registerAsDistributor():** distributors can register their services
  by specifying their deliv- ery fee. The contract tracks registered
  distributors and their fees. To call this function

> **22** *Chapter 4. Implementation*
>
> distributors need to make the security deposit.
>
> Pseudocode for all the relevant ProductEscrow functions can be found
> in the Appendices of this thesis.

### User Interface

> For users to interact with the smart contract we created a User
> Interface(UI) for the marketplace. The UI is structured into three
> main screens, each designed for a specific stakeholder: seller, buyer,
> and distributor. A general view of this UI can be seen in Figure
> [4.3.](#_bookmark41)

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image11.png){width="6.325in"
height="4.15in"}

> []{#_bookmark41 .anchor}**Figure 4.3:** Decentralized marketplace UI

#### Seller screen

> The seller screen consists of 3 tabs as seen in Figure
> [4.3.](#_bookmark41)

- **New product**: This tab allows sellers to create new product
  listings by specifying a name and setting a price.

- **In progress**: In this tab, sellers can track the progress of their
  products that have been pur- chased. Here, sellers can assign a
  distributor, upload the product's verifiable credential (VC), confirm
  the order, or cancel it if necessary.

- **Delivered**: In this tab, sellers can view the products that have
  been successfully delivered

4.  *Implementation of VC storage* **23**

> to the buyer.

#### Buyer screen

> The buyer screen also consists of 3 tabs as seen in Figure
> [4.4.](#_bookmark44)

- **Sale**: In this tab, buyers can search for products and start the
  purchase process by clicking on the buy button and depositing the
  purchase price.

- **In progress**: This tab allows buyers to monitor the delivery status
  of purchased items. This is also the tab where buyers confirm the
  delivery of the product.

- **VCs**: In the final tab buyers can view the VCs of products that
  they have purchased.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image12.jpeg){width="6.444374453193351in"
height="3.17625in"}

> []{#_bookmark44 .anchor}**Figure 4.4:** Decentralized marketplace
> buyer's screen

#### Distributor screen

> The distributor screen looks very similar to the other two screens but
> consists of only two tabs.

- **Offers**: In this tab, distributors can view products awaiting
  delivery. By selecting \"Info,\" they can access further product
  details. A pop-up window allows distributors to propose a delivery fee
  and register as potential distributors, as shown in Figure
  [4.5.](#_bookmark47)

- **In progress**: This tab enables distributors to track the status of
  products they have agreed to deliver.

### Implementation of VC storage

> As discussed earlier, product Verifiable Credentials (VCs) are stored
> on IPFS. For this, we uti- lized the Pinata.cloud service. One
> challenge with using IPFS is ensuring that files remain
>
> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image13.jpeg){width="6.444374453193351in"
> height="3.1324989063867017in"}**24** *Chapter 4. Implementation*
>
> []{#_bookmark47 .anchor}**Figure 4.5:** Decentralized marketplace
> registering as distributor screen
>
> accessible over time. Files on IPFS must be pinned (i.e., hosted
> permanently on a node) to guarantee their continuous availability.
>
> To address this, Pinata offers a service that handles pinning,
> ensuring the user's content remains accessible without the need to
> manage the underlying infrastructure. This solution is particularly
> useful for users who find it impractical to run their own IPFS node
> 24/7. Pinata provides a reliable and easy-to-use platform to keep
> files online.
>
> However, in future implementations, Pinata.cloud could be omitted if
> sufficient resources are available to host the files on our own IPFS
> nodes, thereby decentralizing the infrastructure even further. To pin
> a file on IPFS, we leverage Pinata's API, which returns a Content
> Identifier (CID). This CID can then be used by anyone to view the
> stored file, such as the VC, on the IPFS network.

### Smart Contract Addresses and GitHub Repository

> The ProductFactory smart contract for our decentralized marketplace is
> deployed on both the Ethereum and Shimmer networks, allowing users to
> interact with it on multiple platforms. The contract addresses and the
> GitHub repository link for the source code are provided below.
>
> **Ethereum Deployment:** The smart contract is deployed on the
> Ethereum test network(Sepolia) at the following address:
>
> 0x1fD5d5cCcc8bEebe4bb990285f454f1640afcc3c
>
> Users can interact with this address through tools like Etherscan or
> other Web3-enabled ap- plications.
>
> **Shimmer Deployment:** In addition to Ethereum, the smart contract is
> also deployed on the

5.  *Smart Contract Addresses and GitHub Repository* **25**

> Shimmer test network. The contract address on Shimmer is as follows:
>
> 0x3E76118E0C9fa9e77C238F811Df164a665a4f47F
>
> This deployment provides an alternative for users who prefer to
> operate on the Shimmer network.
>
> **GitHub Repository:** The full project code, including the smart
> contract, front-end application, and deployment instructions, is
> available on GitHub:
>
> GitHub Repository: <https://github.com/EliasSafo/DeMarket>
>
> This repository includes comprehensive documentation on setting up,
> deploying, and inter- acting with the smart contract on Ethereum.

## Evaluation

> In this chapter, we will address the research questions outlined in
> the introduction by ana- lyzing and discussing key findings.
> Additionally, we will present a comparative analysis of the
> transaction costs associated with deploying our system on Ethereum
> versus an alternative blockchain platform.

### Research questions

##### Can a Blockchain-Based System Enable a Fully Independent and Decentralized Supply Chain?

> In designing our system, the goal was to achieve complete
> decentralization, removing the need for third-party intermediaries.
> For transactions that follow an ideal workflow, the sys- tem performs
> effectively, meeting the criteria for a fully decentralized supply
> chain. However, there are edge cases that remain challenging to
> address in a fully autonomous setup. These in- clude scenarios like
> buyer refunds, order cancellations (either by the buyer or by the
> distributor during delivery), and dispute resolution between
> stakeholders.
>
> For example, if a buyer receives a damaged product but only realizes
> this after confirming delivery, the system currently lacks mechanisms
> to allocate accountability and process refunds automatically. While
> blockchain can record and authenticate transactions transparently,
> certain situations may still require a trusted third party or
> arbitration process to mediate disputes and ensure fair outcomes.
>
> To move toward complete independence, further development is needed to
> address these edge cases, potentially through smart contract
> enhancements or decentralized arbitration pro- tocols. This would
> enhance the system's ability to handle exceptions without external
> inter- vention, pushing it closer to the vision of a fully
> decentralized supply chain.

##### Is a Blockchain-Driven Supply Chain More Cost-Efficient Than Current Systems?

> Comparing the cost-efficiency of blockchain-driven supply chains to
> traditional models presents a challenge, as supply chain expenses vary
> widely depending on the industry and region.
>
> However, blockchain introduces specific efficiencies that can reduce
> or eliminate costly pro- cedures typically embedded in traditional
> systems. One primary cost-saving mechanism in a decentralized
> marketplace is the elimination of middlemen. By directly connecting
> buyers, dis- tributors, and sellers, a blockchain-based system can
> streamline transactions, decrease layers of intermediation, and lower
> associated fees.
>
> To understand the economic impact of middlemen in current supply
> chains, we reference a study from the Journal of Agriculture and
> Social Research (JASR) (Vol. 10, No. 2, [2010)\[45\],](#_bookmark103)

27

> **28** *Chapter 5. Evaluation*
>
> which highlights the substantial profit margin middlemen capture in
> agricultural supply chains in developing countries. This research
> reveals that intermediaries often buy farm products at low prices and
> sell them at significantly higher rates to consumers, retaining a
> disproportionate share of profits. This dynamic can distort market
> prices and hinder producers' earnings.
>
> In contrast, our blockchain-based system seeks to reduce these
> inefficiencies by linking buy- ers directly to sellers, providing
> transparency across all transactions. With publicly accessible
> transaction data, buyers can track the flow of goods and identify any
> remaining intermedi- aries, offering insight into their markups. This
> transparency discourages excessive intermedi- ary costs, making the
> supply chain more cost-effective for both producers and consumers.

##### Does Blockchain Technology Guarantee Complete Traceability Throughout the Supply Chain?

> By using chained Verifiable Credentials (VCs) and transaction hashes,
> blockchain can enable traceability throughout the supply chain, as
> each transaction and credential adds a verifiable link in the
> product's journey. This approach significantly enhances transparency,
> as transaction hashes are immutable, making it virtually impossible to
> falsify records within the blockchain. However, this system still has
> limitations because the reliability of VCs ultimately depends on the
> trustworthiness of the parties who sign them(the buyer and seller).
>
> While linking VCs with immutable transaction hashes bolsters
> credibility, vulnerabilities re- main. The effectiveness of verifiable
> credentials (VCs) is reliant on the integrity of certification bodies
> that endorse companies as environmentally and ethically compliant. If
> these certifica- tion processes are corrupted, VCs will fail to
> represent reality, as companies that do not meet ethical standards may
> still be certified. This misrepresentation removes the credibility of
> VCs, as they would inaccurately label unethical companies as
> responsible.
>
> In essence, while blockchain strengthens traceability and holds
> companies accountable by providing evidence of misrepresented product
> origins, the system's integrity relies heavily on the honesty of the
> stakeholders involved. Thus, blockchain can substantially improve
> trace- ability but cannot independently guarantee it.

### Ethereum Cost Analysis

> We chose to build our system on Ethereum because, while it may not be
> the most cost-effective blockchain, its large developer community
> provides a lot of tutorials and libraries that signifi- cantly
> simplify application development.
>
> To analyze Ethereum's gas fees, we deployed and executed our functions
> on Sepolia, an Ethereum testnet (testnets simulate ledgers for testing
> new applications [\[46\]),](#_bookmark104) and compared these results
> with Shimmer, an IOTA [testnet\[47\].](#_bookmark105) To achieve
> reliable estimates for each function, we created three products on
> each testnet, following the ideal workflow for each. This involved
> invoking each smart contract function three times per testnet, after
> which we recorded the average gas used, as shown in the table below.
>
> Table [5.1](#_bookmark52) indicates that the gas usage on the Sepolia
> testnet is consistently higher for each smart contract function. To
> provide a more concrete comparison, we gathered data on the average
> gas costs for both Ethereum and Shimmer over the past week
> (28.10.2024 - 02.11.2024).

3.  *Discussion* **29**

+-----------------------+-----------------------+----------------+
| []{#_bookmark52       | > Gas used in         | > Gas used in  |
| .anchor}Smart         | > Ethereum(Sepolia)   | > Shimmer      |
| Contract Function     |                       |                |
+=======================+=======================+================+
| Deploying the Smart   | > 3,072,679           | > 2,918,793    |
| Contract              |                       |                |
+-----------------------+-----------------------+----------------+
| createProduct         | > 2,421,246           | > 2,199,193    |
+-----------------------+-----------------------+----------------+
| buyProduct            | > 73,152              | > 65,046       |
+-----------------------+-----------------------+----------------+
| confirmOrder          | > 37,743              | > 28,727       |
+-----------------------+-----------------------+----------------+
| registerAsDistributor | > 112,326             | > 104,239      |
+-----------------------+-----------------------+----------------+
| setDistributor        | > 70,820              | > 62,683       |
+-----------------------+-----------------------+----------------+
| confirmDelivery       | > 64,386              | > 44,417       |
+-----------------------+-----------------------+----------------+

> **Table 5.1:** Gas usage in Sepolia and Shimmer test Network
>
> Using this data, we calculated the average dollar cost per function on
> each network.
>
> For Ethereum's mainnet, we used [Etherscan\[48\],](#_bookmark106) a
> widely recognized blockchain explorer [\[49\],](#_bookmark107) to
> retrieve average gas costs. Shimmer's average gas cost data was
> sourced from the Shimmer explorer [\[50\]](#_bookmark108). The average
> gas price for the week was 8.142 Gwei on Ethereum and 0.000001 SMR on
> Shimmer.
>
> To determine the dollar value per Gwei, we used Coinbase to obtain
> Ethereum's average USD price over the week. By dividing this weekly
> average by [1,000,000,000\[51\],](#_bookmark109) we calculated the
> cost of one Gwei, which was approximately \$2.561 *×* 10*−*6.
>
> Similarly, to estimate the average dollar cost of Shimmer (SMR), we
> used Coinbase to retrieve the average USD price for SMR over the same
> period. The resulting average price of SMR for the week was \$0.0023.
>
> With these calculations, we created Table [5.2](#_bookmark53) to
> highlight the dollar cost for each function on both Mainnets by
> multiplying the Gas Used by the average gas price in USD.

  ------------------------------------------------------
  []{#_bookmark53         Price on        Price on
  .anchor}Smart Contract  Ethereum        Shimmer
  Function                                
  ----------------------- --------------- --------------
  Deploying the Smart     \$64.07         \$0.0067
  Contract                                

  createProduct           \$50.49         \$0.0051

  buyProduct              \$1.53          \$0.0001

  confirmOrder            \$0.79          \$0.0001

  registerAsDistributor   \$2.34          \$0.0002

  setDistributor          \$1.48          \$0.0001

  confirmDelivery         \$1.34          \$0.0001
  ------------------------------------------------------

> **Table 5.2:** Gas usage in Sepolia and Shimmer test Network

### Discussion

> In this section, we summarize our assessment of the system we
> developed. Overall, the system demonstrates notable advantages over
> traditional supply chain models. However, it currently possesses
> limitations that prevent it from being a fully viable alternative. We
> are optimistic about the potential of blockchain technology in supply
> chain management, yet improvements in cost efficiency and trust
> mechanisms are essential for broader adoption. As shown in Table
> [5.2,](#_bookmark53) there are opportunities to reduce gas costs
> further by exploring alternative, cost-effective
>
> **30** *Chapter 5. Evaluation*
>
> blockchains such as Shimmer.
>
> We also recognize that blockchain is still in an early stage, and
> widespread adoption is es- sential before a system like ours can
> become fully feasible. Further development could also expand the
> system's capability to handle unique edge cases, potentially creating
> decentralized solutions for these scenarios. Another viable approach
> might be to evolve the system into a semi-decentralized supply chain.
> This would retain the benefits of decentralization, such as
> traceability while integrating specific centralized protocols to
> simplify certain processes. For example, centralizing the arbitration
> process for refunds and resolving stakeholder disputes could reduce
> complexity while maintaining the core values of transparency and
> accountability. Similarly, a partially centralized model for
> distributor bidding could reduce gas costs by lim- iting the number of
> transactions on-chain. For example, only the selected distributor
> could be required to pay a security deposit and bear the gas cost,
> lowering the overall expense associated with such operations.
>
> One aspect that stood out during the development process was how
> straightforward it was to create and deploy the smart contract to
> handle business logic. Once deployed, the contract is accessible to
> anyone. Although the deployment and product creation costs are
> relatively high, the actual smart contract development was quick and
> simple. The majority of the effort went into building the UI for the
> decentralized marketplace, however interacting with the smart contract
> doesn't require it.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image5.png){width="0.7298950131233596in"
height="0.3361450131233596in"}

## Conclusion

> This thesis has explored the potential of blockchain technology in
> revolutionizing the supply chain, a field that, despite its critical
> importance, continues to face inefficiencies and trans- parency
> issues. Blockchain, though still in a relatively early stage, can
> transform various in- dustries, with the supply chain as a prominent
> candidate for its impactful application. By leveraging blockchain's
> inherent attributes we can address long-standing issues in tracking
> and verifying the authenticity and origin of products.
>
> Throughout this work, we demonstrated that blockchain, through
> transaction hashes and chained verifiable credentials, enables more
> reliable tracking mechanisms, ensuring that each product's journey
> from supplier to consumer can be authenticated. However, while the
> tech- nology presents exciting possibilities, the current
> implementations have areas for enhancement that would make these
> systems even more robust, adaptable, and efficient.
>
> Possible future work:

- **Smart Contracts for Contractual Relationships**: Specific smart
  contracts can be built to foster long-term agreements between buyers
  and sellers. For instance, a reusable contract could allow trusted
  buyers and sellers to engage in recurring, pre-defined transactions,
  building a sustained partnership through a decentralized medium.

- **Enhanced Refund and Dispute Resolution Policies**: Introducing
  structured refund poli- cies and dispute resolution mechanisms would
  increase buyer confidence.

- **Confidentiality Through Zero-Knowledge Proofs**: While transparency
  is a key feature of blockchain, the fully public nature of
  transactions might expose sensitive business in- formation. Using
  zero-knowledge proofs would allow businesses to prove the validity of
  transactions without revealing detailed financial data, thus
  preserving competitive ad- vantage while maintaining trust among
  stakeholders.

- **Automated Product Tracing**: Integrating QR codes on final products
  and developing an application to scan these codes could greatly
  streamline the verification process. Instead of manually searching
  through verifiable credentials (VCs) and transaction histories on the
  blockchain, users could instantly access understandable information on
  a product's origin, journey, and authenticity by scanning a single QR
  code. This system would sim- plify end-user interaction.

> In conclusion, while there are challenges to address, the potential
> for a decentralized supply chain powered by blockchain is
> considerable. This system offers benefits to all parties involved,
> cutting out unnecessary intermediaries, creating transparency in
> product sourcing, and giving buyers and sellers a more direct,
> reliable means of communication. As blockchain technol- ogy advances,
> more refined applications will likely emerge, offering even greater
> benefits and efficiencies in supply chain management.

## List of Tables

1.  [Gas usage in Sepolia and Shimmer test Network](#_bookmark52) 29

2.  [Gas usage in Sepolia and Shimmer test Network](#_bookmark53) 29

## List of Figures

1.  [Basic supply chain process.](#_bookmark12) 6

<!-- -->

1.  [Decentralized SupplyChain](#_bookmark30) 12

2.  [Decentralized Marketplace Flowchart.](#_bookmark32) 14

<!-- -->

1.  [Architecture of Decentralized Marketplace](#_bookmark37) 19

2.  [Smart Contract Interactions](#_bookmark39) 20

3.  [Decentralized marketplace UI](#_bookmark41) 22

4.  [Decentralized marketplace buyer's screen](#_bookmark44) 23

5.  [Decentralized marketplace registering as distributor
    screen](#_bookmark47) 24

## Bibliography

1.  []{#_bookmark59 .anchor}A. Rejeb, K. Rejeb, S. Simske, and H.
    Treiblmaier, "Blockchain technologies in logistics and sup-
    []{#_bookmark60 .anchor}ply chain management: a bibliometric
    review," *Logistics*, vol. 5, no. 4, p. 72, 2021.

2.  M. Amann, J. K. Roehrich, M. Eßig, and C. Harland, "Driving
    sustainable supply chain man- agement in the public sector: The
    importance of public procurement in the european union,"
    []{#_bookmark61 .anchor}*Supply Chain Management: An International
    Journal*, vol. 19, no. 3, pp. 351--366, 2014.

3.  E. Parliament and C. of the European Union, "Regulation (eu)
    2024/1252 of the european parliament and of the council of 11 april
    2024 establishing a framework for ensuring a secure and sustainable
    supply of critical raw materials and amending regulations (eu) no
    168/2013, (eu) 2018/858, (eu) 2018/1724 and (eu) 2019/1020," 2024,
    accessed: 29 October 2024. \[Online\].

> []{#_bookmark62 .anchor}Available:
> [https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202401252](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ%3AL_202401252)

4.  Z. Zheng, S. Xie, H.-N. Dai, X. Chen, and H. Wang, "Blockchain
    challenges and opportunities: []{#_bookmark63 .anchor}A survey,"
    *International journal of web and grid services*, vol. 14, no. 4,
    pp. 352--375, 2018.

5.  A. A. Monrat, O. Schelén, and K. Andersson, "A survey of blockchain
    from the perspectives of []{#_bookmark64 .anchor}applications,
    challenges, and opportunities," *Ieee Access*, vol. 7, pp. 117
    134--117 151, 2019.

6.  X. Liu, B. Farahani, and F. Firouzi, "Distributed ledger
    technology," *Intelligent internet of things:* []{#_bookmark65
    .anchor}*From device to fog and cloud*, pp. 393--431, 2020.

7.  M. Xu, X. Chen, and G. Kou, "A systematic review of blockchain,"
    *Financial innovation*, vol. 5, []{#_bookmark66 .anchor}no. 1, 2019.

8.  S. S. Sarmah, "Understanding blockchain technology," *Computer
    Science and Engineering*, vol. 8, []{#_bookmark67 .anchor}no. 2,
    2018.

9.  H. Sheikh, R. M. Azmathullah, and F. Rizwan, "Proof-of-work vs
    proof-of-stake: a comparative analysis and an approach to blockchain
    consensus mechanism," *International Journal for Research*
    []{#_bookmark68 .anchor}*in Applied Science & Engineering
    Technology*, vol. 6, no. 12, pp. 786--791, 2018.

10. S. Tikhomirov, "Ethereum: state of knowledge and research
    perspectives," in *Foundations and Practice of Security: 10th
    International Symposium, FPS 2017, Nancy, France, October 23-25,
    2017,* []{#_bookmark69 .anchor}*Revised Selected Papers 10*.
    Springer, 2018.

11. S. S. Kushwaha, S. Joshi, D. Singh, M. Kaur, and H.-N. Lee,
    "Systematic review of security []{#_bookmark70
    .anchor}vulnerabilities in ethereum blockchain smart contract,"
    *IEEE Access*, vol. 10, pp. 6605--6621, 2022.

12. S. Jani, "An overview of ethereum & its comparison with bitcoin,"
    *Int. J. Sci. Eng. Res*, vol. 10, []{#_bookmark71 .anchor}no. 8,
    2017.

13. []{#_bookmark72 .anchor}V. Buterin *et al.*, "Ethereum white paper,"
    *GitHub repository*, vol. 1, pp. 17--18, 2013.

14. E. Kapengut and B. Mizrach, "An event study of the ethereum
    transition to proof-of-stake,"

> *Commodities*, vol. 2, no. 2, pp. 96--110, 2023.
>
> **38** *6 Bibliography*

15. []{#_bookmark73 .anchor}C. Signer, "Gas cost analysis for ethereum
    smart contracts," Master's thesis, ETH Zurich, De- []{#_bookmark74
    .anchor}partment of Computer Science, 2018.

16. L. Marchesi, M. Marchesi, G. Destefanis, G. Barabino, and D. Tigano,
    "Design patterns for gas optimization in ethereum," in *2020 IEEE
    International Workshop on Blockchain Oriented Software*
    []{#_bookmark75 .anchor}*Engineering (IWBOSE)*. IEEE, 2020, pp.
    9--15.

17. S. Wang, Y. Yuan, X. Wang, J. Li, R. Qin, and F.-Y. Wang, "An
    overview of smart contract: archi- tecture, applications, and future
    trends," in *2018 IEEE Intelligent Vehicles Symposium (IV)*. IEEE,
    []{#_bookmark76 .anchor}2018, pp. 108--113.

18. S. N. Khan, F. Loukil, C. Ghedira-Guegan, E. Benkhelifa, and A.
    Bani-Hani, "Blockchain smart contracts: Applications, challenges,
    and future trends," *Peer-to-peer Networking and Applications*,
    []{#_bookmark77 .anchor}vol. 14, pp. 2901--2925, 2021.

19. Cambridge Dictionary. (n.d.) Escrow. Accessed: 2024-09-16.
    \[Online\]. Available:
    [https:](https://dictionary.cambridge.org/dictionary/english/escrow)

> []{#_bookmark78
> .anchor}[//dictionary.cambridge.org/dictionary/english/escrow](https://dictionary.cambridge.org/dictionary/english/escrow)

20. A. Asgaonkar and B. Krishnamachari, "Solving the buyer and seller's
    dilemma: A dual-deposit escrow smart contract for provably
    cheat-proof delivery and payment for a digital good without a
    trusted mediator," in *2019 IEEE international conference on
    blockchain and cryptocurrency (ICBC)*. []{#_bookmark79 .anchor}IEEE,
    2019, pp. 262--267.

21. M. Steichen, B. Fiz, R. Norvill, W. Shbair, and R. State,
    "Blockchain-based, decentralized access control for ipfs," in *2018
    Ieee international conference on internet of things (iThings) and
    ieee green computing and communications (GreenCom) and ieee cyber,
    physical and social computing (CPSCom)* []{#_bookmark80 .anchor}*and
    ieee smart data (SmartData)*. IEEE, 2018, pp. 1499--1506.

22. J. Benet, "Ipfs-content addressed, versioned, p2p file system,"
    *arXiv preprint arXiv:1407.3561*, []{#_bookmark81 .anchor}2014.

23. M. Naz, F. A. Al-zahrani, R. Khalid, N. Javaid, A. M. Qamar, M. K.
    Afzal, and M. Shafiq, "A secure data sharing platform using
    blockchain and interplanetary file system," *Sustainability*,
    []{#_bookmark82 .anchor}vol. 11, no. 24, p. 7054, 2019.

24. B. M. Beamon, "Supply chain design and analysis:: Models and
    methods," *International journal* []{#_bookmark83 .anchor}*of
    production economics*, vol. 55, no. 3, pp. 281--294, 1998.

25. G. C. Stevens, "Integrating the supply chain," *international
    Journal of physical distribution & Mate-* []{#_bookmark84
    .anchor}*rials Management*, vol. 19, no. 8, pp. 3--8, 1989.

26. V. P. Ranganthan, R. Dantu, A. Paul, P. Mears, and K. Morozov, "A
    decentralized marketplace application on the ethereum blockchain,"
    in *2018 IEEE 4th International Conference on Collabora-*
    []{#_bookmark85 .anchor}*tion and Internet Computing (CIC)*. IEEE,
    2018, pp. 90--97.

27. J. Sunny, N. Undralla, and V. M. Pillai, "Supply chain transparency
    through blockchain-based traceability: An overview with
    demonstration," *Computers & Industrial Engineering*, vol. 150, p.
    []{#_bookmark86 .anchor}106895, 2020.

28. R. Azzi, R. K. Chamoun, and M. Sokhn, "The power of a
    blockchain-based supply chain," *Com-* []{#_bookmark87
    .anchor}*puters & industrial engineering*, vol. 135, pp. 582--592,
    2019.

29. J. E. Arps and N. Christin, "Open market or ghost town? the curious
    case of openbazaar," in *Financial Cryptography and Data Security:
    24th International Conference, FC 2020, Kota Kinabalu, Malaysia,
    February 10--14, 2020 Revised Selected Papers 24*. Springer, 2020,
    pp. 561--577.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image5.png){width="0.7298950131233596in"
height="0.3361450131233596in"}

> *6 Bibliography* **39**

30. []{#_bookmark88 .anchor}B. White, A. Mahanti, and K. Passi,
    "Characterizing the opensea nft marketplace," in *Companion*
    []{#_bookmark89 .anchor}*Proceedings of the Web Conference 2022*,
    2022, pp. 488--496.

31. S. Jabbar, H. Lloyd, M. Hammoudeh, B. Adebisi, and U. Raza,
    "Blockchain-enabled supply chain: analysis, challenges, and future
    directions," *Multimedia systems*, vol. 27, pp. 787--806, 2021.

32. J. Yli-Huumo, D. Ko, S. Choi, S. Park, and K. Smolander, "Where is
    current research on blockchain technology?---a systematic review,"
    *PloS one*, vol. 11, no. 10, p. e0163477, 2016.

33. P. De Filippi, C. Wray, and G. Sileno, "Smart contracts," *Internet
    Policy Review*, vol. 10, no. 2, pp. []{#_bookmark92 .anchor}1--9,
    2021.

34. M. A. Alqarni, M. S. Alkatheiri, S. H. Chauhdary, and S. Saleem,
    "Use of blockchain-based smart []{#_bookmark93 .anchor}contracts in
    logistics and supply chains," *Electronics*, vol. 12, no. 6, p.
    1340, 2023.

35. I. A. Omar, H. R. Hasan, R. Jayaraman, K. Salah, and M. Omar,
    "Implementing decentralized auctions using blockchain smart
    contracts," *Technological Forecasting and Social Change*, vol. 168,

> []{#_bookmark94 .anchor}p. 120786, 2021.

36. Y.-H. Chen, S.-H. Chen, and I.-C. Lin, "Blockchain based smart
    contract for bidding system," in

> []{#_bookmark95 .anchor}*2018 IEEE International Conference on Applied
> System Invention (ICASI)*. IEEE, 2018, pp. 208--211.

37. S. Suratkar, M. Shirole, and S. Bhirud, "Cryptocurrency wallet: A
    review," in *2020 4th inter- national conference on computer,
    communication and signal processing (ICCCSP)*. IEEE, 2020, pp.
    []{#_bookmark96 .anchor}1--7.

38. W.-M. Lee and W.-M. Lee, "Using the metamask chrome extension,"
    *Beginning Ethereum Smart* []{#_bookmark97 .anchor}*Contracts
    Programming: With Examples in Python, Solidity, and JavaScript*, pp.
    93--126, 2019.

39. Z. A. Lux, D. Thatmann, S. Zickau, and F. Beierle,
    "Distributed-ledger-based authentication with decentralized
    identifiers and verifiable credentials," in *2020 2nd Conference on
    Blockchain Research* []{#_bookmark98 .anchor}*& Applications for
    Innovative Networks and Services (BRAINS)*. IEEE, 2020, pp. 71--78.

40. J. A. Llamas-Orozco, F. Meng, G. S. Walker, A. F. Abdul-Manan, H. L.
    MacLean, I. D. Posen, and J. McKechnie, "Estimating the
    environmental impacts of global lithium-ion battery supply chain: A
    temporal, geographical, and technological perspective," *PNAS
    nexus*, vol. 2, no. 11, p. []{#_bookmark99 .anchor}pgad361, 2023.

41. R. Verma, N. Dhanda, and V. Nagar, "Application of truffle suite in
    a blockchain environment," in *Proceedings of Third International
    Conference on Computing, Communications, and Cyber-Security:*
    []{#_bookmark100 .anchor}*IC4S 2021*. Springer, 2022, pp. 693--702.

42. W.-M. Lee and W.-M. Lee, "Using the web3. js apis," *Beginning
    Ethereum Smart Contracts Pro-* []{#_bookmark101 .anchor}*gramming:
    With Examples in Python, Solidity, and JavaScript*, pp. 169--198,
    2019.

43. M. Wohrer and U. Zdun, "Smart contracts: security patterns in the
    ethereum ecosystem and solidity," in *2018 International Workshop on
    Blockchain Oriented Software Engineering (IWBOSE)*. []{#_bookmark102
    .anchor}IEEE, 2018, pp. 2--8.

44. P. Kumar, M. Gupta, and R. Kumar, "Improved cloud storage system
    using ipfs for decentralised data storage," in *2023 International
    Conference on Data Science and Network Security (ICDSNS)*.
    []{#_bookmark103 .anchor}IEEE, 2023, pp. 01--06.

45. O. Oguoma, V. Nkwocha, and I. Ibeawuchi, "Implications of middlemen
    in the supply chain of []{#_bookmark104 .anchor}agricultural
    products," *Journal of Agriculture and Social Research (JASR)*, vol.
    10, no. 2, 2010.

46. D. Reshef Kera, "Sandboxes and testnets as "trading zones" for
    blockchain governance," in

> **40** *6 Bibliography*
>
> []{#_bookmark105 .anchor}*Blockchain and Applications: 2nd
> International Congress*. Springer, 2020, pp. 3--12.

47. W. Zhao, I. M. Aldyaflah, P. Gangwani, S. Joshi, H. Upadhyay, and L.
    Lagos, "A blockchain- facilitated secure sensing data processing and
    logging system," *IEEE Access*, vol. 11, pp. 21 712--
    []{#_bookmark106 .anchor}21 728, 2023.

48. Etherscan, "Ethereum gas tracker,"
    [https://etherscan.io/gastracker#chart_gasprice,](https://etherscan.io/gastracker#chart_gasprice)
    2024, ac- []{#_bookmark107 .anchor}cessed: 2024-11-02.

49. J. Wang, T. Sasaki, K. Omote, K. Yoshioka, and T. Matsumoto,
    "Multifaceted analysis of mali- cious ethereum accounts and
    corresponding activities," in *2022 6th International Conference on*
    []{#_bookmark108 .anchor}*Cryptography, Security and Privacy (CSP)*.
    IEEE, 2022, pp. 71--79.

50. Shimmer EVM Explorer, "Shimmer network statistics,"
    [https://explorer.evm.shimmer.](https://explorer.evm.shimmer.network/stats)
    []{#_bookmark109
    .anchor}[network/stats,](https://explorer.evm.shimmer.network/stats)
    2024, accessed: 2024-10-30.

51. J. Swati and P. Nitin, "Cryptoscholarchain: Revolutionizing
    scholarship management frame- work with blockchain technology,"
    *International Journal of Advanced Computer Science and Appli-
    cations*, vol. 14, no. 8, 2023.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_458423-media/media/image5.png){width="0.7298950131233596in"
height="0.3361450131233596in"}

# Appendices

41

##### 43

> **Algorithm 1** ProductEscrow Contract
>
> 1: **function** CONTRACT INITIALIZATION(name, price, owner)
>
> 2: **Input:** name (product name), price (product price), owner
> (owner's address)
>
> 3: Set name to \_name
>
> 4: Set price to \_price
>
> 5: Set owner to \_owner
>
> 6: Initialize purchased to **false**
>
> 7: Set buyer to **null**
>
> 8: **end function**
>
> 9:
>
> 10: **function** CONFIRM DELIVERY(vcCID) onlyBuyer
>
> 11: **Input:** vcCID (verification code content identifier)
>
> 12: **Require:** block.timestamp *≤* purchaseTimestamp + 2 days
>
> 13: Transfer price to owner
>
> 14: Transfer securityDepositAmount + deliveryFee to distributor
>
> 15: Transfer ownership to buyer 16: Emit **DeliveryConfirmed** event
> 17: **end function**
>
> 18:
>
> 19: **function** CONFIRM ORDER(vcCID) onlySeller
>
> 20: **Input:** vcCID
>
> 21: **Require:** purchased is true 22: Reset purchaseTimestamp 23:
> Emit **OrderConfirmed** event 24: **end function**
>
> 25:
>
> 26: **function** DEPOSIT PURCHASE notSeller
>
> 27: **Require:** purchased is false
>
> 28: **Require:** msg.value *≥* price 29: **Require:** msg.sender *̸*=
> owner 30: Set buyer to msg.sender
>
> 31: Set purchased to **true**
>
> 32: Set purchaseTimestamp to block.timestamp
>
> 33: **end function**
>
> 34:
>
> 35: **function** CANCEL DELIVERY onlySeller
>
> 36: **Require:** purchased is true
>
> 37: Transfer deliveryFee + securityDeposit to distributor
>
> 38: Transfer deliveryFee to seller
>
> 39: Transfer price - deliveryFee to buyer
>
> 40: Emit **CancelDelivery** event
>
> 41: **end function**
>
> 42:
>
> 43: **function** SET DISTRIBUTOR(\_distributor) onlySeller
>
> 44: **Input:** \_distributor (address of distributor)
>
> 45: **Require:** msg.value == distributors\[\_distributor\].fee
>
> 46: **Require:** distributors\[\_distributor\].fee *̸*= 0 47: Transfer
> securityDeposit to distributors that dont get set 48: Set deliveryFee
> to msg.value
>
> 49: Set distributor to \_distributor
>
> 50: **end function**
>
> 51:
>
> 52: **function** REGISTER AS DISTRIBUTOR(\_feeInEther) 53: **Input:**
> \_feeInEther (fee charged by distributor) 54: **Require:**
> distributors\[msg.sender\].fee == 0 55: **Require:** msg.value *≥*
> price
>
> 56: Update securityDepositAmount
>
> 57: Add distributor with fee \_feeInEther
>
> 58: Increment distributorCount 59: Emit **DistributorRegistered**
> event 60: **end function**
>
> 61:
>
> 62: **function** GET ALL DISTRIBUTORS
>
> 63: **Return:** List of distributor addresses and their corresponding
> fees
>
> 64: **end function**
