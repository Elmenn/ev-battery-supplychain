![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image1.jpeg)

Implementing Verifiable Credentials for Enhanced Transparency and
Traceability in the Modern Supply Chain

### by

> **Luca Garriet Janßen Matriculation Number 381812**
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
> October 11, 2024
>
> Supervised by: Prof. Dr. Axel Küpper
>
> Assistant supervisor:
>
> Prof. Dr.-Ing. habil. Falko Dressler

## Eidestattliche Erklärung / Statutory Declaration

> Hiermit erkläre ich, dass ich die vorliegende Arbeit selbstständig und
> eigenhändig sowie ohne unerlaubte fremde Hilfe und ausschließlich
> unter Verwendung der aufgeführten Quellen und Hilfsmittel angefertigt
> habe. Sofern generative KI-Tools verwendet wurden, habe ich Pro-
> duktnamen, Hersteller, die jeweils verwendete Softwareversion und die
> jeweiligen Einsatz- zwecke (z.B. sprachliche Überprüfung und
> Verbesserung der Texte,nsystematische Recherche) benannt. Ich
> verantworte die Auswahl, die Übernahme und sämtliche Ergebnisse des
> von mir verwendeten KI-generierten Outputs vollumfänglich selbst.
>
> Die Satzung zur Sicherung guter wissenschaftlicher Praxis an der TU
> Berlin vom 8. März 2017
> [https://www.static.tu.berlin/fileadmin/www/10000060/FSC/Promotion](http://www.static.tu.berlin/fileadmin/www/10000060/FSC/Promotion)
> Habilitation/
> Dokumente/Grundsaetze_gute_wissenschaftliche_Praxis_2017.pdf
>
> habe ich zur Kenntnis genommen.
>
> Ich erkläre weiterhin, dass ich die Arbeit in gleicher oder ähnlicher
> Form noch keiner anderen Prüfungsbehörde vorgelegt habe.
>
> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image4.png){width="2.0364020122484687in"
> height="1.73501312335958in"}I hereby declare that I have created this
> work completely on my own and used no other sources or tools than the
> ones listed.
>
> Berlin, October 11, 2024 Luca Garriet Janßen

# Acknowledgments

> I want to thank Kaustabh Barman for providing me with the opportunity
> to work on the topic of this thesis. He has guided me throughout the
> process of research, coding and writing. He has always been open to
> questions and feedback and I always felt well supported during my
> thesis. I hope that I was able to contribute to his research with this
> thesis. Additionally, I want to thank my friends and my family for
> giving me strength and joy. They helped me stay motivated and focused
> during the challenges of this thesis.

# Abstract

> Transparency and traceability are becoming increasingly difficult and
> important in the modern supply chain. Verifiable credentials and
> related concepts and technologies like self sovereign identity,
> decentralized identifiers and smart contract based transactions
> promise new solutions to these challenges. This thesis proposes a data
> model for receipts as verifiable credentials rep- resenting products
> in the supply chain. Furthermore, this thesis implements a use case in
> the form of a model supply chain to showcase and test the potential
> benefits of the proposed data model. The thesis evaluates if the
> proposed model can contribute to increased transparency and
> traceability in the modern supply chain.

# Zusammenfassung

> Transparenz und Nachverfolgbarkeit werden in der modernen Lieferkette
> gleichzeitig immer komplizierter und wichtiger. Verifiable Credentials
> und damit verbundene Konzepte und Technologien wie Self Sovereign
> Identity, Decentralized Identifiers und auf Smart Contracts basierende
> Transaktionen versprechen neue Lösungen für diese Herausforderungen.
> In dieser Arbeit wird ein Datenmodell für Receipts als Verifiable
> Credentials für Produkte in der Liefer- kette vorgeschlagen. Darüber
> hinaus wird in dieser Arbeit ein Anwendungsfall in Form einer Modell
> Lieferkette implementiert, um die potenziellen Vorteile des
> vorgeschlagenen Daten- modells aufzuzeigen und zu testen. Die Arbeit
> evaluiert, ob das vorgeschlagene Modell zu einer erhöhten Transparenz
> und Nachverfolgbarkeit in der modernen Lieferkette beitragen kann.

# Contents

# 

1.  [Introduction](#introduction) 1

    1.  [Motivation](#motivation) 1

    2.  [Research Objective](#research-objective) 1

    3.  [Outline](#outline) 2

2.  [Background and Related Work](#background-and-related-work) 3

    1.  [Supply Chain](#supply-chain) 3

        1.  [Supply Chain Definition](#supply-chain-definition) 3

        2.  [Supply Chain Management](#supply-chain-management) 3

    2.  [Blockchain](#blockchain) 3

        1.  [Blockchain Technology
            Overview](#blockchain-technology-overview) 3

        2.  [Smart Contracts](#smart-contracts) 5

        3.  [Ethereum](#ethereum) 5

    3.  [Self Sovereign Identity](#self-sovereign-identity) 5

        1.  [Decentralized Identifier](#decentralized-identifier) 6

        2.  [Verifiable Credential](#verifiable-credential) 7

    4.  [IPFS](#ipfs) 9

    5.  [Literature Review](#literature-review) 9

        1.  [Verifiable Credential Interoperability
            Model](#verifiable-credential-interoperability-model) 9

        2.  [Tracing via Blockchain-based
            Tokens](#tracing-via-blockchain-based-tokens) 10

        3.  [Aries Chained Credentials](#aries-chained-credentials) 10

3.  [Concept and Design](#concept-and-design) 11

    1.  [Problem Statement](#problem-statement) 11

    2.  [Architecture](#architecture) 12

        1.  [System Architecture
            Overview](#system-architecture-overview) 12

        2.  [Flow of Information](#flow-of-information) 12

    3.  [Identity Management](#identity-management) 13

        1.  [Identity Creation](#identity-creation) 14

        2.  [Signing and Verification](#signing-and-verification) 14

    4.  [Verifiable Credential Data
        Model](#verifiable-credential-data-model) 15

        1.  [General Attributes](#general-attributes) 15

        2.  [Related Credentials](#related-credentials) 16

        3.  [Proofs](#proofs) 17

    5.  [Decentralized Storage](#decentralized-storage) 18

4.  [Implementation](#implementation) 19

    1.  [Technology Stack](#technology-stack) 19

        1.  [JavaScript](#javascript) 19

        2.  [React](#react) 19

        3.  [Express and Axios](#express-and-axios) 20

        4.  [Ethr-Did](#ethr-did) 20

        5.  [IPFS](#ipfs-1) 22

    2.  [Use Case Demonstration](#use-case-demonstration) 23

        1.  [Supply Chain Model](#supply-chain-model) 23

        2.  [User Experience](#user-experience) 25

    3.  [Core Functionality](#core-functionality) 27

        1.  [Signing](#signing) 28

        2.  [Verification](#verification) 28

    4.  [Development and Code
        Organization](#development-and-code-organization) 29

    5.  [Deployment](#deployment) 30

5.  [Evaluation](#evaluation) 31

    1.  [Solution Validation](#solution-validation) 31

    2.  [Performance](#performance) 32

    3.  [State of the Art Comparison](#state-of-the-art-comparison) 35

    4.  [Result](#result) 36

6.  [Conclusion](#conclusion) 39

[List of Figures](#list-of-figures) 41

[Bibliography](#bibliography) 43

# Introduction

> In this section we will present the motivation for this thesis.
> Furthermore, we will define the research question and hypotheses,
> followed by a brief outline of the structure thesis structure.

## Motivation

> Modern supply chains (SC) are increasingly complex, interconnected and
> geographically dis- tributed [\[1\]](#_bookmark84)
> [\[2\].](#_bookmark85) Therefore, traceability of products is becoming
> more important in many differ- ent industries [\[3\].](#_bookmark86)
> For many industries such as the food industry, SCs have become so
> complex that it is difficult to trace the origin and contents of a
> product. In the food SC specifically, this raises severe problems of
> security, consumer health and reputational risk [\[4\].](#_bookmark87)
> In general, a lack of transparency leads to the inability of both
> companies and customers to verify and validate the value of a product
> [\[2\].](#_bookmark85) Furthermore, the effort needed to establish
> trust and the exchange of information adds costs to the operation of
> companies within SCs [\[5\].](#_bookmark88) Therefore, from a business
> perspective there are multiple incentives to increase traceability and
> transparency in a compa- nies SC.
>
> Additionally, existing legislation by the EU will require companies to
> adhere to certain stan- dards within their SC. The EU regulation on
> critical raw resources [\[6\]](#_bookmark89) mandates that, starting
> in 2025, certain large companies must carry out SC risk assessments at
> least every three years. This requirement applies to sectors that use
> strategic raw materials to manufacture products such as batteries,
> satellites and mobile electronics. This risk assessment includes
> mapping where the strategic raw resources used are extracted,
> processed or recycled. While the regulation takes into account the
> possible lack of available information, having accurate data about
> their prod- uct SCs will become increasingly important for companies
> conducting these risk assessments. The EU regulation on batteries
> [\[7\]](#_bookmark90) mandates that, starting in 2027 each industrial
> battery with a capacity greater than 2 kWh and each electric vehicle
> battery shall have an electronic record, also called a battery
> passport. This battery passport has to include information like the
> battery model, the material composition, the carbon footprint and the
> recycled content of the battery. Furthermore this information has to
> be accessible to the general public. The requirements of this
> regulation can only be met if a certain level of transparency and
> traceability in the battery SC is achieved.
>
> This thesis aims to provide a model of verifiable credentials (VC)
> that addresses the aforemen- tioned issues by increasing transparency
> and traceability in a blockchain-based SC.

## Research Objective

> The following research question aims to assess whether the model that
> will be proposed in this thesis contributes to increased transparency
> and traceability in the SC:

**Research Question:** Is it possible to trace a products SC by
utilizing VCs in a blockchain based system?

Regarding this research question, the following Hypotheses are defined:

**Hypothesis 1:** The proposed model can chain VCs that are issued for
products. The chaining is done in a way that allows access from a VC to
its predecessor. This hypothesis is important to enable traceability.

**Hypothesis 2:** The proposed model allows for products to be
transformed or processed into

different products. This hypothesis is important for the tracing of
manufactured products. **Hypothesis 3:** The proposed model can be
cryptographically verified. This hypothesis is im- portant to create
trust in the model.

**Hypothesis 4:** The proposed model is non-repudiable and immutable.
This hypothesis is im- portant for building trust in the model and is
necessary for real world usage.

## Outline

This thesis is structured as follows. In section 2 the relevant terms
and technologies will be explained and we will perform a literature
review of related relevant papers. In section 3 the concept and design
of the proposed model will be explained. In section 4 the actual im-
plementation will be described, this includes giving an understanding of
the code and also a walk-through of the implemented process. In section
5 the model will be evaluated in terms of its performance and its
ability to fulfill the given research hypotheses. In section 6 the
findings of the thesis will be stated and there will be an outlook on
potential future work.

# Background and Related Work

> In this chapter, the concepts, terms and technologies that are
> relevant for the understanding of this thesis are defined and
> explained. There will also be a literature review on current
> blockchain solutions, discussing their findings and limitations.

## Supply Chain

> In this section the terms SC and Supply Chain Management (SCM) will be
> explained in a con- cise way to give a functional understanding of the
> concepts.

### Supply Chain Definition

> La Londe et al. [\[8\]](#_bookmark91) define a SC as a set of
> companies that facilitate the flow of materials and products within
> the context of manufacturing and commercial transactions. This
> encompasses the whole process from raw material production to selling
> a product to an end user. There are different actors involved in the
> SC like producers, distributors, manufacturers and retailers. In
> practice, a SC can involve up to hundreds of companies
> [\[8\].](#_bookmark91)

### Supply Chain Management

> SCM can be defined as the management of materials, products and
> information flows in and between different facilities. These
> facilities include vendors, manufacturing plants and distri- bution
> centers [\[9\].](#_bookmark92) SCM has the purpose of improving the
> long term performance of both the individual company and of the SC in
> general [\[10\].](#_bookmark93) Furthermore, SCM aims to provide high
> quality services and high satisfaction for end customers
> [\[11\].](#_bookmark94)

## Blockchain

> In this section the term blockchain technology will be explained.
> Furthermore smart contract in relation to blockchain as well as the
> ethereum blockchain will be described.

### Blockchain Technology Overview

> A Blockchain is a variant of distributed ledger technology (DLT)
> [\[12\].](#_bookmark95) A distributed ledger (DL) is a type of
> distributed database [\[13\].](#_bookmark96) Replications of the
> ledger are locally stored on sev- eral nodes. Due to the data being
> replicated and stored on multiple nodes, this introduces the challenge
> of ensuring that the data is consistent among the nodes.
> Inconsistencies can occur

for example when nodes crash or are no longer reachable. Also, in DLT
the possibility that nodes have explicitly malicious intent is
considered. Therefore, DLT and provides a consensus mechanism to ensure
that benign nodes can agree on a correct version of the ledger despite
the presence of malicious nodes. DLs only allow adding new data and
reading existing data, deleting or editing existing data is not allowed
and should be made impossible [\[13\].](#_bookmark96)

Furthermore, DLT relies on public key cryptography to uniquely identify
individual partici- pants and to enable the recording of transactions in
the DL. This is especially important given that nodes cannot inherently
trust each other [\[14\].](#_bookmark97) In a public key cryptography
system, each participant has a private key and a public key that is
mathematically derived from the pri- vate key. The private key is only
known to the individual participant while the public key is accessible
by everyone. A participant can use their private key to digitally sign a
document and other participants can use the public key to determine of
the document was indeed signed by the corresponding participant
[\[15\].](#_bookmark98) Public key cryptography relies on algorithms
that can easily calculate a public key from a private key, but are very
difficult to reverse to calculate the private key from the public key.
Examples are RSA [\[15\],](#_bookmark98) ECC [\[16\]](#_bookmark99) or
EdDSA [\[17\].](#_bookmark100) In the context of DLT, the usage of
digital signatures allows for control of ownership and therefore
non-repudiation [\[14\].](#_bookmark97) It thereby forms the
technological basis to establish trust and security among nodes.

In the concept of a blockchain, if new information like a transaction is
added to the chain, it is done in the form of so called blocks
[\[18\].](#_bookmark101) This is achieved by broadcasting a participants
signed transaction directly to peer nodes in the network. These nodes
then validate the transaction. If the transaction is valid, they
transmit it to their peers. Thereby the transaction is spread through
the network. This transaction is then bundled with other transactions in
the same time interval into a timestamped candidate block by a so called
mining node [\[19\].](#_bookmark102) The process of mining is determined
by the blockchains consensus algorithm. The most common consensus
algorithms are proof of work (PoW) and proof of stake (PoS)
[\[20\].](#_bookmark103) After mining, the block is broadcast to the
network and other nodes in the network verify that the block references
the previous block on the blockchain by a cryptographic hash and verify
that the block contains valid transactions [\[19\].](#_bookmark102)

In PoW algorithms, nodes have to perform computationally expensive
operations to solve a mathematical problem related to a new block
[\[21\].](#_bookmark104) The first node to solve this problem shares the
solution with other peers, which can then validate the solution
[\[22\].](#_bookmark105) The node that solved the problem is rewarded
with an amount of cryptocurrency [\[21\].](#_bookmark104) In PoS
algorithms, nodes can stake an amount of the blockchains cryptocurrency
for a chance to be selected to validate a new block. If a node validates
a block, it gets rewarded with an amount of cryptocurrency. The stake is
held as collateral in the blockchain and nodes can lose their stake for
dishonest or rule breaking behaviour [\[23\].](#_bookmark106)

Due to the described technical and conceptual details, the blockchain
possesses some advanta- geous properties. Since the blockchain is
decentralized, there is no need for a central authority. Furthermore,
because the blockchain is openly distributed, it offers transparency to
all its par- ticipants. Lastly, the integrity of the data on the
blockchain can be trusted due to it being practically immutable
[\[12\].](#_bookmark95)

### Smart Contracts

> The term smart contract has different meanings in different fields
> [\[24\].](#_bookmark107) This subsection de- scribes smart contracts
> in relation to blockchain. In this context, a smart contract is
> executable computer code that is stored on a blockchain. It moves
> digital assets according to rules that are specified in the code
> [\[25\].](#_bookmark108) Due to such automated transactions, smart
> contracts allow for safe and trusted activities between parties
> without the need for a central authority. They also inherit the
> properties of traceability, transparency and irreversibility from the
> blockchain [\[26\].](#_bookmark109)

### Ethereum

> Ethereum is a decentralized platform that is designed to write and
> execute smart contracts and decentralized applications (DApps)
> [\[25\].](#_bookmark108) The core of ethereum is a blockchain that has
> a built-in Turing complete programming language. It thereby provides
> an abstract layer to allow anyone to write smart contracts and DApps
> in which can create their own rules for ownership, transaction formats
> and state transition functions. Smart contracts in Ethereum are
> executed in the Ethereum Virtual Machine (EVM).Ethereum can also be
> used for decentralized file stor- age [\[25\].](#_bookmark108)
>
> In 2022 Ethereum switched from a proof of work to a proof of stake
> consensus mechanism. This has the advantage of a vastly reduced energy
> consumption compared to proof of work blockchains like Bitcoin
> [\[27\].](#_bookmark110) Furthermore proof of stake allows for fast
> block creation, high throughput and scalability
> [\[20\].](#_bookmark103) Ethereum is currently the second largest
> blockchain platform after Bitcoin measured by its usage as a
> cryptocurrency, therefore it has a lot of available re- sources and
> support [\[28\].](#_bookmark111)

## Self Sovereign Identity

> The concept of Self Sovereign Identity (SSI) describes an identity
> management system (IMS) that allows individuals to own and manage
> their own digital identity. Digital identity is a means for a person
> or other entity to electronically prove who they are
> [\[29\].](#_bookmark112) Although the con- cept of digital identity is
> typically applied to people, it can be used to prove the identity of
> any entity.
>
> Due to the increased use of online services in the past decades,
> identity management has be- come more important as a consequence. Many
> providers and services have their own IMS, leading to users having
> multiple identities across these different services
> [\[30\].](#_bookmark113) Alternatively users can rely on large
> identity providers like Facebook or Google [\[29\].](#_bookmark112)
> However, users have little to no control over their identity data
> stored by providers and services, and servers that store this data can
> become targets for attacks [\[31\].](#_bookmark114)
>
> SSI promises to solve these issues by giving users full control over
> their own identity data [\[30\].](#_bookmark113) Christopher Allen
> proposed ten principles of SSI, with which he attempted to ensure user
> con- trol over their identity while balancing transparency, fairness
> and support of the commons with protection for the individual
> [\[32\].](#_bookmark115) The ten principles of SSI according to Allen
> are:

- **Existence**: Users must have an independent existence.

- **Control**: Users must control their identities.

- **Access**: Users must have access to their own data.

- **Transparency**: Systems and algorithms must be transparent.

- **Persistence**: Identities must be long-lived

- **Portability**: Information and services about identity must be
  transportable.

- **Interoperability**: Identities should be as widely usable as
  possible.

- **Consent**: Users must agree to the use of their identity.

- **Minimalization**: Disclosure of claims must be minimized.

- **Protection**: The rights of users must be protected.

These principles were cited from Allen [\[32\].](#_bookmark115) The
following subsections will explain how SSI can be achieved by utilizing
different concepts and technologies related to blockchain.

### Decentralized Identifier

This thesis follows the recommendations for expressing a decentralized
identifier (DID) that are published by the World Wide Web Consortium
(W3C) [\[33\].](#_bookmark116) A DID is a type of identifier that allows
for verifiable, decentralized identity. It enables self-sovereignty and
allows for au- thentication in a way that keeps users privacy intact. A
DID refers to a subject, which is fully owned and controlled by the DID
controller [\[34\].](#_bookmark117) A subject can be any entity such as
a person, an organization or a product.

A DID is a string that consists of three parts, as highlighted in
[2.1.](#_bookmark14) The first part is the scheme. This is standardized
as \"did\" and indicates that the identifier is a DID. The second part
is the method that determines the rules and syntax of the identifier
[\[34\].](#_bookmark117) There are different DID methods for different
underlying networks and technologies like ethereum \"ethr\" or sovrin
\"sov\", a full overview is given by W3C [\[35\].](#_bookmark118) The
third part is the identifier, which is specific to the DID method and
identifies the subject of the DID [\[34\].](#_bookmark117)

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image6.jpeg){width="3.185in"
height="0.4949989063867017in"}

> []{#_bookmark14 .anchor}**Figure 2.1:** Simplified example of a DID
> string

A DID is part of a larger DID architecture, [2.2](#_bookmark15) shows an
overview over the basic compo- nents according to W3C standard
[\[33\].](#_bookmark116) A DID refers to the DID subject and is
resolvable to a DID document. A DID URL is an extension of a DID and
allows for the incorporation of URI components like path.A DID document
contains information that is associated with a DID like cryptographic
keys and verification methods. The DID controller owns the DID and is
able to make changes to the DID document. A DID is stored on a
verifiable data registry (VDR), to be resolvable to a DID document. A
VDR is a system or network that can facilitate the necessary operations
associated with DIDs and DID documents. A VDR could be a decentralized
file system, a peer to peer network or a distributed ledger
[\[33\].](#_bookmark116)

> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image7.png){width="5.125in"
> height="1.9916655730533683in"}
>
> []{#_bookmark15 .anchor}**Figure 2.2:** Overview of a typical DID
> architecture according to W3C standard
>
> DIDs are complemented by VCs [\[34\],](#_bookmark117) which will be
> covered in the next subsection.

### Verifiable Credential

> This thesis follows the recommendations for expressing VCs that are
> published by the W3C [\[36\].](#_bookmark119) A VC involves three
> independent entities: an issuer, a holder, and a verifier, each with a
> unique identity. The W3C describes a VC as a credential that is
> tamper-evident, has authorship and can be cryptographically verified
> [\[36\].](#_bookmark119) A credential is a set of claims made by an
> issuer about a subject.
>
> [2.3](#_bookmark17) shows the different roles associated with a VC
> according to the W3C recommendations. A subject is an entity about
> which claims are made. An issuer is an entity that asserts claims
> about a subject, creates a VC from these claims and transfers it to a
> holder. A holder is an entity that possesses a VC. A verifier is an
> entity that processes a VC in its original form or as part of a
> verifiable presentation [\[36\].](#_bookmark119) These roles can be
> exemplified by a real world analogy. A driver is stopped by the police
> and proves that they own the car they drive by presenting a
> certificate of ownership. In this case, the car is the subject, the
> driver is the holder, the police is the verifier and the government
> institution that issued the certificate is the issuer.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image8.png){width="4.334061679790026in"
height="1.3330205599300087in"}

> []{#_bookmark17 .anchor}**Figure 2.3:** Overview of different roles
> associated with a VC

The data model of a VC as recommended by the W3C can be encoded as JSON.
The attributes of the data model are showcased in [2.4](#_bookmark18)
with a simple example of a VC.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image9.jpeg){width="5.6821872265966755in"
height="3.3309372265966752in"}

> []{#_bookmark18 .anchor}**Figure 2.4:** Simple example VC according to
> W3C standard

- **context**: Specifies the context for interpreting the JSON data and
  establishes special terms used

- **id**: Identifier of the VC

- **type**: Specifies the credential types, hence what data to expect in
  the VC

- **issuer**: Issuer of the VC

- **holder**: Holder of the VC

- **issuanceDate**: Date and time of when the VC was issued

- **credentialSubject**: Subject of the VC, has an identifier and can
  have more attributes de- scribing it

- **proof**: Cryptographic proof that relates to the integrity and
  authenticity of the VC

From these attributes arise the beneficial characteristics of a VC. The
context attribute al- lows the model to be extended. New schema can be
added to the context and newly defined attributes from such schema can
then be used in the VC. The proof attribute contains a cryp- tographic
proof method, such as a digital signature. According to W3C, this
attribute ensures that a VC is tamper-evident and cryptographically
verifiable, allowing for verification of au- thorship
[\[36\].](#_bookmark119) Furthermore, attributes used to identify
entities, such as id, issuer, holder, or id of the credentialSubject,
benefit from implementation as DIDs. DIDs enable verification as
explained in the last subsection and also facilitate portability of VCs
without requiring reis- suance.

4.  *IPFS* **9**

## IPFS

> The Interplanetary File System (IPFS) is a decentralized, globally
> distributed file system based on distributed hash table technology
> [\[37\].](#_bookmark120) IPFS is peer-to-peer, nodes store data
> locally and no nodes are privileged. Files in IPFS are content
> addressable by the cryptographic hash of their content, also called
> content identifier (CID). This makes data in IPFS essentially
> immutable since changing a files content changes its hash, therefore
> making it a new file [\[37\].](#_bookmark120) IPFS can be useful in
> blockchain applications because not all data needs to be stored
> on-chain [\[38\],](#_bookmark121) and IPFS is generally less expensive
> and more efficient than blockchain for storing data
> [\[39\].](#_bookmark122)

## Literature Review

> Blockchain based solutions are being discussed and proposed across
> many different fields like food [\[40\],](#_bookmark123)
> pharmaceutical [\[41\]](#_bookmark124) or electric vehicle battery
> [\[42\]](#_bookmark125) SCs. According to Sunny et al.
> [\[43\],](#_bookmark126) most of these solutions are conceptual in
> nature and their real world viability is yet to be ana- lyzed. This
> section presents and analyzes proposed solutions for SC provenance
> that are based on blockchain technologies and are relevant to this
> thesis. The overall concept, the findings and the limitations of the
> papers will be presented, and potentially useful information for this
> thesis will be highlighted.

### Verifiable Credential Interoperability Model

> Yeray et al. [\[41\]](#_bookmark124) developed a model for a VC that
> addresses the problems of standardization and interoperability for a
> SC containing different blockchain-based systems. This paper focuses
> on the pharmaceutical SC.
>
> This model extends the W3C schema for VCs with two additional schemes,
> the \"VSCC-schema\" and the \"Asset-Standard-schema.\" These schemes
> introduce two new attributes, "previousCre- dential" and
> "relatedCredential\". The "previousCredential" attribute contains the
> product's VC from the previous company in the SC, while the
> "relatedCredential" attribute contains the VCs of components of the
> product if it is manufactured from other parts. This links the creden-
> tials in a way that enables the complete tracing of the SC history of
> a product. Additionally, the proof attribute is changed to proofs and
> includes \"issuerProof\" and \"holderProof.\" Both the is- suer and
> the holder must sign the credential for it to be valid, creating a
> handshake that reduces the reliance on trust. Lastly, the VC includes
> the attribute \"verificationService,\" which specifies how the VC
> should be verified. This allows for interoperability between different
> blockchain- based systems. This model works even if only a minimum of
> data being stored directly on the blockchain, like identifiers and VC
> hash values. The VC itself can be stored off chain, for example on a
> distributed file system like IPFS.
>
> There are limitations on this model. The storage of public information
> of the VC in distributed storage systems is regulated by the General
> Data Protection Regulation (GDPR) [\[44\].](#_bookmark127) Further-
> more, due to the inclusion of the "previousCredential" and
> "relatedCredential\" attributes. The size of a VC can grow
> exponentially along the SC. The authors claim that the size of a VC in
> a realistic scenario will be acceptable. This claims depends highly on
> the length and complexity of the SC and has to be further proven for
> different sectors. Lastly, this model is depends on the honesty of
> participants, as issuers can theoretically include whatever they want
> in VCs.

### Tracing via Blockchain-based Tokens

Westerkamp et. al. [\[45\]](#_bookmark128) proposed a blockchain-based
SCM system based on smart contracts to improve traceability, especially
for manufactured goods.

In the prototypical implementation of this system, a smart contract is
set up for each type of product in the SC. Such a smart contract can
then create tokens which represent products. To- kens can have different
batch-sizes so that different quantities of products can be represented.
These tokens are non-fungible tokens (NFTs), therefore they are unique,
enabling differentia- tion between different product batches
[\[46\].](#_bookmark129) If a product is made up of components, the
smart contract for that product type will consume the tokens for these
components as input to create tokens for that product. Due to this
implementation, the production process of a product can be traced on the
blockchain. This includes the entire SC, including components, and even
allows for time information due to the timestamps of new blocks.

There are limitations on this model. Similar to the previous paper, this
proposal would increase transparency and publicize information that is
currently confidential. This would necessitate the willingness of
participants to disclose this information. Furthermore, the system would
face the general challenge of scalability within current
blockchain-based systems. As this pro- totype is based on ethereum, it
would have to take into account the operational gas costs. There are
also some missing functionalities like handling packaging or shrinkage.

### Aries Chained Credentials

Hardman et al. [\[47\]](#_bookmark130) propose a set of conventions that
aim to enable the tracing of data con- tained within VCs back to its
origin while preserving the verifiability of the data.

Their proposal seeks to solve an inherent trust issue within the VC
ecosystem. In a decentral- ized system, where any entity can issue
claims, it can be difficult for verifiers to choose which issuers to
trust. The solution proposed by Hardman et al. is to include proof of
the data of cer- tain attributes directly within the VC. To achieve
this, the VC that they propose contains two additional fields. Firstly,
this VC model contains a field named schema, which is an encoded
representation of its own schema. This has the effect of the VC being
self contained by not de- pending on a schema defined by an external
authority. Secondly, the VC model contains a field named
provenanceProofs, which is an array of tuples. Each tuple consists of a
field name and a verifiable presentation (VP). The VP acts as proof for
the values in the corresponding field. The proposal focuses on the use
of this model for delegation. For delegation, the provenanceProofs would
contain proof that a product and certain permissions regarding the
product where del- egated to the holder of the VC by another entity
holding the permission to delegate.

There are limitations to this proposal. One limitation, which is
acknowledged by the authors themselves, is that the trust framework has
to be properly defined. Otherwise malicious ac- tors might be able to
get credentials from delegations, which would lead to an escalation of
privilege. Another limitation is that the authors do not provide an
actual implementation of this proposal. The example given in the
proposal does not contain an actual proof. Therefore further work would
be necessary to confirm the viability of this model.

# Concept and Design

> In this chapter, the concepts used in the implementation of the
> solution are explained. This includes an overview of the architecture,
> user perspectives, as well as the used technologies, data models and
> algorithms.

## Problem Statement

> To reiterate the research objective of this thesis, this thesis aims
> to answer the research question stated in the introduction: \"Is it
> possible to trace a products SC by utilizing VCs in a blockchain based
> system?\"
>
> The solution given in this thesis proposes a data model for a VC which
> is designed to achieve this goal. This data model is the core of this
> thesis. Furthermore, a user interface (UI) was implemented for
> hypothetical users to be able to look at information contained within
> a VC by providing an identifier for the VC. This interface also
> provides information about the verifica- tion status of a VC.
> Additionally, functionality for identity creation for the entities
> interacting with the VC was implemented. In this case, these entities
> represent the participants of the SC. The functionality to use the
> created identities to sign a VC was also implemented.
>
> In this proposed model, companies first create a VC for a product.
> When the product is sold, both buyer and seller sign the VC and it is
> then uploaded to a decentralized database. For this thesis we assume
> that the transactions in the SC are done via smart contracts.
> Therefore, a transaction id exists for each sale of a product, which
> links it to an address on the blockchain. This transaction id is also
> included in the VC. While the identity creation and signing of VCs was
> implemented for this thesis, it is not the focus and therefore not
> done in an automated way. The exact process of uploading VCs to a
> decentralized database and the creation of smart contracts for
> transactions were out of scope for this thesis. Therefore the upload
> of VCs was done manually.
>
> In this proposed model, users like customers or companies can look up
> information about a VC via a UI. An input of an identifier for a VC is
> required. This identifier is then processed and the corresponding VC
> is retrieved from the distributed database. The transaction from the
> transaction id contained within the VC is then retrieved from the
> blockchain. The VC is then cryptographically verified and the
> information of the VC, the transaction and the verification details
> are then shown in the UI. Users then also have the option to look at
> predecessor VCs, which is enabled by the data model of the VC. The
> main focus of this thesis is on the data model, enabling the chaining
> of VCs via that data model and the presentation and verification of
> VCs to a user.

11

## Architecture

This section describes the architecture of the proposed system.
Furthermore, it explains the flow of data between architectural
components in detail.

### System Architecture Overview

The architecture for the user-interface and the included functionality
of looking up and verify- ing a VC can generally be described as a
client-server architecture. Client-server architecture can be defined as
a software architecture that contains one or more clients as well as a
server. The clients send requests to the server and the server sends
responses back to the clients [\[48\].](#_bookmark131) In this
implementation the server is represented by the backend and the client
is represented by the frontend. The backend also sends out requests to
IPFS. The responses from those systems are then sent back to the
frontend.

For the identity creation, signing of VCs and the uploading of VCs there
is no significant archi- tecture to show. The identity creation and
signing is done via scripts and the uploading of VCs is done manually.
In a real world use case this would most likely be integrated into the
busi- ness processes of the companies and would therefore be automated.
For this thesis a manual implementation is sufficient.

### Flow of Information

1.  illustrates the flow of data and the interaction of the different
    previously described archi- tectural components. A detailed
    explanation is also given here:

    1.  The user starts by inputting the identifier for the VC that they
        want to look up into a search field. This identifier has the
        format of an IPFS content identifier (CID).

    2.  This CID is then stored as a constant in the frontend. The
        frontend then sends an asyn- chronous post request to the
        backend with the CID. The frontend expects the VC and a success
        or error message as return values.

    3.  The backend receives the request and attempts to fetch the CID
        from IPFS, using the base URL of the utilized IPFS provider and
        combining it with the given CID. As explained in the previous
        chapter, content on IPFS is self referential. Consequently, the
        CID of a file is also its address on IPFS
        [\[37\].](#_bookmark120) Therefore, if a valid CID was given
        this combined URL will return the VC stored on IPFS.

    4.  After attempting to call this combined IPFS URL and getting a
        response, the backend will return the VC and a success message
        to the frontend. If the VC for the CID could not be fetched, an
        error message will be returned.

    5.  The frontend will present an error message for the user if there
        is no VC returned in the response of the backend. If the
        fetching of the VC was successful, the VC will be stored as a
        constant. The VC will not yet be presented to the user at that
        point. Before presenting the the VC, the VC has to be verified.
        For that the frontend sends a post request to the backend to
        verify the VC. In the VC data model there are two types of VCs:
        product VCs and certificate/license VCs. These have to be
        verified in a slightly different way. More information will be
        given in the Data Model section.

    6.  The backend receives the request and then verifies the proofs
        section of the VC, specif- ically the Json Web Signature (JWS).
        It checks if the JWS is valid an if it matches the information
        and companies presented in the VC. This process differs for
        product VCs and certificate/license VCs.

    7.  After the verification is done, the backend returns the details
        on the results of the verifi- cation and a success message of
        the frontend. If the verification could not be performed, an
        error message is returned. To clarify, this error message is not
        returned when any part of the verification yields a negative
        result, but rather only when the verification process cannot be
        performed at all.

    8.  The frontend will present an error message if there is no
        verification result returned in the response of the backend.
        Otherwise the frontend will then present the details of the
        verification to the user. Below that, the information contained
        within the VC will be pre- sented. This information will also be
        shown if the verification yields partly or completely negative
        results, as long as it was performed.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image10.png){width="5.052915573053368in"
height="4.089791119860018in"}

> []{#_bookmark29 .anchor}**Figure 3.1:** Flow of data between the
> architectural components

## Identity Management

> In order to represent the stakeholders in a SC like companies and
> customers that would in- teract with the VCs that are proposed in this
> thesis, these stakeholders need distinct digital

identities. This section covers the topics of identity creation as well
as signing and verification and highlights their necessity for ensuring
trust and authenticity.

### Identity Creation

To set up an identity for a stakeholder, a private key is generated,
which is stored by the stake- holder and never shared or published. From
this private key a public key is calculated in a way that is not easily
reversible, based on the public key cryptography explained in 2.2.1.
Further- more, from this public key an address is derived, which can be
used to represent an address on the ethereum network. The public key is
then used as part of a DID specific to the ethereum network. The
specific implementation is explained in 4.1.4. Relevant for this section
is that the private key is only known by the stakeholder for which it
was set up and that the public key cannot be used to easily calculate
the private key. Therefore the public key and by extension the DID can
be used to publicly identify the stakeholder and the private key can be
used to prove the identity of the stakeholder through several operations
like signing and verification.

### Signing and Verification

With the stakeholders distinct digital identity set up in the form of a
DID based on a key pair of a public key and a private key, the
stakeholder can now perform operations such as signing and verifying
digital documents and transactions. In the case of this thesis, the
stakeholders need to sign and verify VCs representing products.
Specifically, the ECDSA Secp256k1 algo- rithm was used for signing and
verification. Secp256k1 is a specific domain parameter for the koblitz
curve, which is a type of elliptic curve used for the ECDSA
[\[49\].](#_bookmark132) ECDSA is an algorithm for creating and
verifying digital signatures based on elliptic curve cryptography
[\[50\].](#_bookmark133) As de- scribed by Stallings
[\[51\]](#_bookmark134) the signing and verification process involves
the following steps.

1.  All those participating in the digital signature scheme use the same
    global domain parame- ters, which define an elliptic curve and a
    point of origin on the curve.

2.  A signer must first generate a public, private key pair. For the
    private key, the signer selects a random or pseudorandom number.
    Using that random number and the point of origin, the signer
    computes another point on the elliptic curve. This is the signer's
    public key.

3.  A hash value is generated for the message to be signed. Using the
    private key, the domain parameters, and the hash value, a signature
    is generated. The signature consists of two inte- gers, r and s.

4.  To verify the signature, the verifier uses as input the signer's
    public, key, the domain param- eters, and the integer s. The output
    is a value v that is compared to r. The signature is verified if v
    = r. These steps were cited from Stallings [\[51\].](#_bookmark134)

A reason why ECDSA is used instead of other schemes, is that it provides
security similar to other schemes while having a smaller bit key length
[\[51\].](#_bookmark134) This provides an efficiency advan- tage when
using ECDSA. Secp256k1 is a koblitz curve defined by the following
equation over a finite field [\[49\]:](#_bookmark132)

> *y*^2^ = *x*^3^ + *ax* + *b* (3.1)
>
> As stated above, the ECDSA algorithm is a cryptographic algorithm for
> issuing digital sig- natures. As described in 2.2.1, such digital
> signatures allow for controls of ownership and therefore
> non-repudiation. In the case of this thesis, stakeholders sign VCs
> representing prod- ucts. Other stakeholders can the verify their
> signatures using their public key and can ensure if the VC was indeed
> signed by the stakeholder identified by their DID.

## Verifiable Credential Data Model

> The VC data model proposed in this thesis is mainly based on the VC
> interoperability model proposed by Yeray et al
> [\[41\],](#_bookmark124) as well as on the W3C VC data model
> recommendation [\[36\].](#_bookmark119) It differs by some key changes
> and additions. The important sections and attributes will be high-
> lighted in this section. The complete VC data model can be accessed
> via the github repository [1](#_bookmark36). The core idea for the VC
> data model is that a VC is issued for a specific product when it is
> sold and represents that product. The product is the subject of the VC
> and the involved entities are the seller and the buyer, which are
> represented by their DIDs. With the issuance of the VC the seller and
> buyer agree on the information about the product and agree that
> ownership of the product was transferred. The VC also contains
> attributes that allow traceability of the products path along the SC.

### General Attributes

> The issuer and holder attribute contain two fields, as shown in
> [3.2.](#_bookmark35) The issuer represents the seller of the product
> and the holder represents the buyer of the product. The \"id\" field
> con- tains a DID that identifies a company or individual. The DID can
> be resolved to an ethereum address. The \"name\" field represents the
> name of the issuer or holder, which refers to the com- pany or
> individual associated with the DID. This field was included to
> facilitate the clear and user-friendly presentation of information
> contained in the VC on the frontend. By providing a human-readable
> name, it enhances the ease with which users can understand and
> interact with the VCs details.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image11.jpeg){width="6.15in"
height="1.2166666666666666in"}

> []{#_bookmark35 .anchor}**Figure 3.2:** issuer and holder attributes
> of the proposed VC
>
> The \"credentialSubject\" represents the product that is being
> transferred between the seller and the buyer. The \"subjectDetails\"
> therefore contain information about the product like what type of
> product it is, the quantity and a specific batch number. Arbitrarily
> more attributes de- scribing the product could be added here. The
> \"transactionId\" attribute contains a transaction id for a
> transaction on the ethereum blockchain. This transaction would
> represent the sale of
>
> 1 []{#_bookmark36
> .anchor}https://github.com/kaustabhbarman/vc-Supplychain/tree/vc-prototype

the product on the ethereum blockchain. For the purposes of this thesis
it is assumed that all transactions within the SC are done via ethereum
smart contracts. This attribute provides two distinct advantages.
Firstly, it backs the information regarding the product by enabling
veri- fication through comparison with the details contained within the
transaction. This includes whether the transaction was successful,
meaning whether the product was actually sold. It can also entail data
about the product itself, if that information was provided within the
transaction data. Secondly, it allows the verification of the issuer and
holder DID. Since these DIDs repre- sent the seller and the buyer,
respectively, it is crucial that both DIDs are incorporated into the
transaction recorded on the Ethereum blockchain. This involvement
ensures that the identities of both parties are authenticated and
traceable within the transaction.

### Related Credentials

The following three attributes could be grouped as related credentials.
They are key to estab- lishing a chain of VCs that can be traced along
the SC. They also represent a modification and extension of the
attributes \"previousCredential\" and \"relatedCredentials\" from the
model pro- posed by Yeray et al [\[41\].](#_bookmark124)

The \"previousCredential\" attribute shown in [3.3](#_bookmark38)
includes both the IPFS CID and the name of a prior VC. This field is
applicable when the current seller did not manufacture the product as-
sociated with the current VC, but instead bought it from another seller.
It effectively represents the VC associated with the products prior step
in the SC.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image12.png){width="3.6499989063867018in"
height="0.5833333333333334in"}

> []{#_bookmark38 .anchor}**Figure 3.3:** previousCredential attribute
> of the proposed VC

The \"componentCredential\" attribute shown in [3.4](#_bookmark39)
contains IPFS CIDs and names for a list of VCs. These represent the
components used to manufacture the product represented by the cur- rent
VC. This field is applicable when the product was assembled from various
components by the current seller. It provides a detailed record of the
individual VCs associated with each com- ponent, thereby documenting the
provenance and verification of the materials that contribute to the
product. This attribute enables chaining of products that were assembled
from com- ponents and helps track the origins and authenticity of the
components used in the products manufacturing process.

> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image13.png){width="3.775in"
> height="1.533332239720035in"}
>
> []{#_bookmark39 .anchor}**Figure 3.4:** componentCredentials attribute
> of the proposed VC
>
> The \"certificateCredential\" attribute shown in [3.5](#_bookmark40)
> contains the IPFS CID and the name of a VC. This represents a
> certificate issued to the seller of the product represented by the VC.
> This certificate should come from a government or another institution
> of authority. This field should always be filled for a VC representing
> the first product within a SC, i.e. a provider of raw resources. This
> establishes a trust anchor at the very start of the SC.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image14.png){width="3.6499989063867018in"
height="0.5833333333333334in"}

> []{#_bookmark40 .anchor}**Figure 3.5:** certificateCredential
> attribute of the proposed VC
>
> Due to the VCs contained within the attributes grouped as related
> credentials being linked via their IPFS CIDs, they can be easily
> accessed from the current VC. This was done to create a chain of VCs
> to trace a products origins within the SC.

### Proofs

> The \"proofs\" attribute of the VC in this thesis shown in
> [3.6](#_bookmark42) is modeled after the model pro- posed by Yeray et
> al. [\[41\].](#_bookmark124) It differs from the W3C VC data model
> recommendation [\[36\].](#_bookmark119) The W3C model proposes one
> proof, in which the issuer of the VC is the signing entity. This model
> proposes two proofs. An \"issuerProof\" for the issuer and a
> \"holderProof\" for the holder. These represent the seller and the
> buyer respectively. The structure of each proof is in accordance with
> the recommendation by the W3C. The \"type\" attribute references the
> specific implemen- tation of the signature algorithm used. As
> mentioned in 3.3.2, the Secp256k1 implementation of ECDSA was used in
> this thesis. The \"created\" attribute contains the timestamp of the
> proof and the \"proofPurpose\" attribute contains the reason that the
> VC was signed. In both the W3C recommendation as well as in the model
> proposed by Yeray et al the \"verificationMethod\" at- tribute
> contains the public key by which the signature in the jws can be
> verified. In this thesis, the \"verificationMethod\" attribute
> contains the DID of the issuer of the proof. The DID is gen- erated
> during identity creation as described in 3.3.1. In that subsection it
> was also described that for the ethereum DID the public key of that
> DID is used as the identifier. Thereby the public key is contained
> within the DID and can be used to verify the proof. The \"jws\"
> attribute contains the actual signature value. In this thesis, this is
> in the form of a JWT.

The decision to include two proofs allows the model to accurately
represent the roles of both the seller and the buyer. By incorporating
both the \"issuerProof\" and the \"holderProof\", the model establishes
a handshake principle between the seller and buyer. This approach aims
to ensure mutual agreement on the contents of the VC, most importantly
about the product in- formation. The \"issuerProof\" represents the
sellers endorsement of the product details, while the \"holderProof\"
represents the buyers acceptance of those details. This mitigates the
risk of retrospective changes to the VC, as both parties must confirm
and validate the information con- tained in the VC. Furthermore it
forces both parties to sign the VC using their DID. This proves that
they are the actual owner of the DIDs given to identifying them, as
signing is only possible with a DIDs private key. In summary, this
highlights a key advantage of using receipts as VCs to represent
products: Both the seller and buyer agree on the products details in a
verifiable and non-repudiable manner by digitally signing the VC with
their DIDs. This aims to ensure trust and accountability.

Note that for a certificate VC, this model does not include
\"holderProof\". This is due to the fact that unlike in the sale of a
product, it is not important that the company or entity receiving the
certificate agrees with the content of the certificate. All authority
lies with the entity issuing the certificate, which should be an
institution like a government.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image15.png){width="4.349998906386702in"
height="2.4833333333333334in"}

> []{#_bookmark42 .anchor}**Figure 3.6:** proofs attribute of the
> proposed VC

## Decentralized Storage

The VCs representing products described in the data model section 3.4
are stored on IPFS. As stated in 2.4, IPFS is a decentralized, globally
distributed file system [\[37\].](#_bookmark120) The most important
point about this decentralized storage is that the data stored on IPFS
is available publicly. This is crucial for the goals of this thesis.
This thesis aims to increase traceability and transparency in the SC by
representing products as VCs. These VCs are then supposed to be searched
for by anyone to gather information about the product and its SC. This
is however only possible if the VCs are accessible by the public, which
is achieved with this decentralized mode of storage on IPFS. Thereby the
decentralized storage of VCs on IPFS contributes significantly to
increased transparency and availability of information.

# Implementation

> In this chapter, the details of the implementation of this thesis are
> explained. This encompasses the relevant tools and technologies used
> for the implementation. Moreover, it includes a use case example that
> was implemented for a specific SC, including the user experience in
> the UI. Furthermore, it involves an Overview over the development
> process, the code organization and the deployment.

## Technology Stack

> In this section the tools relevant for the implementation of this
> thesis will be explained. This includes systems, frameworks, libraries
> and programming languages. It will be explained what these tools were
> used for and why they were chosen.

### JavaScript

> For this thesis the programming language used in the frontend and the
> backend is JavaScript (JS). JS is a programming language typically
> used for web programming. For the frontend, JS was chosen because it
> is the most common programming language used for web development. Web
> browsers also already have a dedicated JS engine for code execution.
> For the backend, JS was chosen even though it is not as commonly used
> for backend development as for frontend development. The reason for
> this us is the relative simplicity of the backend requirements and
> this choice enabled the author to use a single programming language
> throughout the entire project. Additionally, it allowed for the
> consistent use of the same editor during the devel- opment process.
> Also there is a huge ecosystem around JS with many frameworks to
> choose from and libraries to use. There are several common variations
> of JS, such as TypeScript, which extends JS by incorporating optional
> static typing. However, we utilized pure JS in this thesis.

### React

> For this thesis React was used as a framework for JS. React is an
> open-source JS library devel- oped by Facebook for building UIs,
> particularly for single-page applications [\[52\].](#_bookmark135)
> React allows for the creation of UI components that can update and
> render as data changes. These compo- nents can be reused. React adopts
> a declarative programming style, which helps simplify the development
> and debugging process. Additionally, React utilizes a virtual Document
> Object Model (DOM) to optimize updates, ensuring fast and efficient
> rendering [\[52\].](#_bookmark135) React was used in this thesis
> because it is a commonly used framework. Furthermore it offers a
> streamlined setup process with the create react app tool. Although
> other frameworks, such as Vue.js and

19

Angular, present comparable advantages, we selected React for its
familiarity and experience with the library.

### Express and Axios

In this thesis, the Axios and Express libraries were utilized to
facilitate communication be- tween the frontend and backend components
of the application. Axios [1](#_bookmark50) is a promise-based HTTP
client for JS, which used for making asynchronous HTTP requests from the
browser. It allows the frontend to send requests to the backend, handle
responses, and manage errors. On the backend, Express is a minimal and
flexible web application framework for Node.js that provides a robust
set of features for web and mobile applications [2](#_bookmark51). It
was used to create and manage the server-side routes and handle HTTP
requests from the client. Together, Axios and Express enable
communication between the frontend and backend, ensuring data can be ex-
changed. Requests initiated by Axios from the frontend are received by
the Express server on the backend, where they are processed, and the
appropriate response is generated and sent back to the client.

### Ethr-Did

For this thesis the Ethr-Did library [3](#_bookmark52) along with the
Ethr-Did-Resolver library [4](#_bookmark53) and the Ethr- Did-Registry
library [5](#_bookmark54) were used to create, manage and use DIDs in
the form of Ethr-Did iden- tifiers. In the following, any reference to a
DID specifically pertains to an Ethr-Did identi- fier. The Ethr-Did
library conforms to the ERC-1056 standard for ethereum lightweight iden-
tity. ERC-1056 is a standard that was implemented for the creation and
modification of digital identities [\[53\].](#_bookmark136) The purpose
of this standard is to minimize the costs of identity creation and
management by limiting the necessary interactions and transactions on
the blockchain. This is achieved by eliminating costs associated with
the initial creation of an identity, as no blockchain transaction is
required, thereby incurring no gas fees. Transactions are only necessary
for mod- ifications to an existing identity, like adding or revoking
delegates to manage signing on behalf of the owner of the identity. With
the Ethr-Did library, the minimal requirement needed to create a DID is
an identifier. This identifier can be in the form of a public key or an
ethereum address. However, a DID created without a private key can only
be used in a limited way. Such a Did can provide its owner, its ethereum
address, its full DID string and it can verify signa- tures of other
DIDs. Such a DID cannot be used to sign documents itself and it cannot
make modifications to its identity. Ethr-Did offers key creation in the
form of the method *createKey- Pair()*, which generates a private key, a
public key, an ethereum address and an identifier, which is identical to
either the public key or the ethereum address. In this use case the
identifier is taken from the public key. The public key is calculated
from the private key and the ethereum address is a hash of the public
key. [4.1](#_bookmark55) shows the result of the *createKeyPair()*
method.

> 1 [[]{#_bookmark51 .anchor}]{#_bookmark50
> .anchor}https://github.com/axios/axios, accessed on 09 September 2024
>
> 2 []{#_bookmark52 .anchor}https://github.com/expressjs/express,
> accessed on 09 September 2024
>
> 3 []{#_bookmark53 .anchor}https://github.com/uport-project/ethr-did,
> accessed on 11 September 2024
>
> 4 []{#_bookmark54
> .anchor}https://github.com/decentralized-identity/ethr-did-resolver,
> accessed on 11 September 2024
>
> 5 https://github.com/uport-project/ethr-did-registry, accessed on 11
> September 2024
>
> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image16.jpeg){width="5.943437226596675in"
> height="0.9915616797900263in"}
>
> []{#_bookmark55 .anchor}**Figure 4.1:** Output of the Ethr-Did
> *createKeyPair()* method
>
> This key pair is used as an identity for DID creation in this thesis.
> This means that the DID itself does not have to be stored by the owner
> of the identity, only the identity has to be stored. To be exact, only
> the private key needs to be stored, as the public key and subsequently
> the ethereum address are calculated from the private key. Whenever the
> owner needs to perform actions like signing a document, they can
> create the DID from this key pair. This will always yield the exact
> same DID. To create the DID, there is no need for an interaction or
> transaction on the ethereum blockchain. The registration of the DID on
> the blockchain is implicit. This is due to the fact that the public
> key is calculated by using the koblitz curve (secp256k1) algorithm, an
> elliptic curve cryptographic algorithm that will be explained in a
> later subsection. The impor- tant property of this algorithm is that
> it is computationally infeasible to determine the private key from the
> public key. Therefore even if the public key and ethereum address are
> known to potentially malicious actors, they cannot use these to modify
> the identity or impersonate the owner of the DID. This is due to the
> above mentioned limited use of DIDs created without a private key.
>
> A DID can be resolved to a DID document as shown in
> [4.2](#_bookmark56) using the Ethr-Did-Resolver library. This resolver
> is initialized with the address of the Ethr-Did-Registry smart
> contract. This smart contract allows the modification and creation of
> attributes of an existing DID. These modifi- cations require on chain
> interactions with the smart contract. To read any Ethr-Did-Registry
> contract events associated with that DIDs ethereum address, the
> resolver needs to be set up with this smart contract as an attribute.
> When the **resolve()** function of the resolver is invoked on a DID,
> the Ethr-Did-Registry contract events associated with that DIDs
> ethereum address are retrieved. Subsequently, the DID document is
> constructed based on this information and the public key and address
> information of the did. Therefore, the DID document itself does not
> have to be stored on chain or off chain, as invoking the resolve()
> function on a DID will always produce the DID document.
>
> To sign a document a DID can call the **signJWT()** function on the
> given document. This pro-
>
> duces a JSON Web Token (JWT), which is a standard format (RFC 7519)
> for representing en- coded claims that have to be passed from one
> party to another [\[54\].](#_bookmark137) This format consists of a
> header and a payload, which are Base64Url-encoded, and a signature.
> The header specifies the used algorithm and token type. The payload
> contains the data, in this case a VC. The signature consists of a
> cryptographic hash of the encoded header and payload, created using
> the private key. It can be verified by using the corresponding public
> key. **signJWT()** function adds the public key of the signing DID to
> the payload. This is relevant for verifying the JWT.
>
> To verify a JWT, DID can call the **verifyJWT()** function on the
> given JWT, utilizing a previously
>
> described resolver as an additional parameter. The public key of the
> signing DID, which is required to verify the signature part of the
> JWT, is included in the JWTs payload. As a result, any DID can call
> this function to perform the verification. The resolver is necessary
> to check if

any delegate signers where set up for the DID via the Ethr-Did-Registry
smart contract.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image17.jpeg){width="6.218437226596675in"
height="3.93625in"}

> []{#_bookmark56 .anchor}**Figure 4.2:** Basic DID document built from
> a DID by the Ethr-Did-Resolver

Ethr-Did and the related libraries were used in this thesis for several
reasons. Firstly, they fully encompass the creation of identities and
DIDs, the resolution of DID documents, and the signing and verification
of VCs. Because these components are designed to interact seamlessly and
depend on one another, there is no need for the author to implement
interfaces between different solutions, which might have been necessary
otherwise. Secondly, these libraries are designed to implement the
ERC-1056 ethereum lightweight identity. As there was no need in this
thesis to modify any attributes for DIDs like assigning delegates, this
completely removed the need for the author to realize any interaction
with the ethereum blockchain. As a result, there were no gas costs
incurred.

### IPFS

This thesis uses IPFS to store the involved VCs in a decentralized
matter [\[37\].](#_bookmark120) This allows for easy access to a VC via
its CID. The VC can be accessed through the IPFS network itself using
applications like IPFS Desktop or via a URL. The fact that the VCs are
content addressed via their CID ensures immutability
[\[37\],](#_bookmark120) especially if the VCs are linked to each other.
If the VCs contain the CIDs of related VCs, to change one VC all other
VCs in the chain would also have to be changed in order to include the
changed CIDs, leading to greatly increased difficulty for malicious
actors to manipulate VCs. IPFS was chosen over alternatives like
Filecoin or Swarm because it is widely adopted and has a large community
which provides extensive resources

> and tools [\[55\],](#_bookmark138) most importantly IPFS pinning
> services. In this thesis the IPFS pinning service Filebase was used
> instead of storing the VCs directly on IPFS. Due to the resources of
> the author, the VCs could only be uploaded on two nodes, which also
> where not available at all times. This lead to requests for VCs via
> IPFS often timing out before the content could be found. Filebase
> solves this by providing an IPFS pinning service to pin files on the
> Filebase nodes in the IPFS network. Filebase also provides a public
> IPFS gateway, improving the accessibility of content stored on
> Filebase IPFS nodes. Lastly, Filebase provides free storage up to a
> certain amount [6](#_bookmark60). Storing VCs on IPFS via Filebase
> solved the reliability issues encountered when trying to access file
> that were stored on IPFS directly.

## Use Case Demonstration

> In this section the specific use case set up to showcase the VC data
> model and the UI will be explained. This includes a description of the
> SC of the use case, the VCs involved in that SC and the presentation
> of VC information in the UI.

### Supply Chain Model

> For this thesis, a simplified example SC for a battery was modeled.
> This SC is presented in [4.3.](#_bookmark61) The product was chosen to
> be a battery for several reasons. Firstly, it is easy to model a SC
> for a battery that includes all the processes and stages represented
> in the related credentials of the VC data model. The mining of raw
> resources can realistically involve licenses issued by a gov- ernment
> or other institution of authority. A battery and its constituents also
> are manufactured from different components. Furthermore, a battery is
> likely to be sold along vendors in the later phases of the SC. Another
> reason a battery was chosen as an example product is the EU regulation
> on batteries [\[7\]](#_bookmark90) that was mentioned in the
> introduction of this thesis. This suggests that SCs for batteries
> could benefit considerably from improved traceability.
>
> The first element in the modeled SC is a government ministry. It does
> not produce anything, but it issues a mining certificate to a lithium
> miner and is therefore still considered part of the SC for the
> purposes of this thesis. The lithium miner is the first element of the
> SC to produce an product, which is lithium. The lithium miner sells
> the lithium to an anode producer and a cathode producer. The anode
> producer and cathode producer process the lithium to produce anodes
> and cathodes respectively. For the sake of simplicity, this model
> assumes that lithium is the only component required for the production
> of these products. These producers both sell their products to a
> battery manufacturer. The battery manufacturer processes the anodes
> and cathodes to produce batteries. It is again assumed that anodes and
> cathodes are the only components necessary to produce batteries. The
> batteries are then sold by the battery manu- facturer to a battery
> retailer. The battery retailer performs no additional processing and
> sells the batteries to customers. The customers are represented by a
> singular customer in this model. The simplified SC is also
> [4.3](#_bookmark61) to showcase the relations between the different
> participants.
>
> 6 []{#_bookmark60 .anchor}https://docs.filebase.com/
>
> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image18.png){width="4.878437226596676in"
> height="3.559374453193351in"}
>
> []{#_bookmark61 .anchor}**Figure 4.3:** Simplified model SC for a
> battery

The VCs created for this thesis encapsulate the SC history of a batch of
batteries within this proposed simplified SC. The VCs and their
relations to each other are shown in [4.4.](#_bookmark62) The VCs and
how they are linked will be explained from the end of the SC backwards
towards the start of the SC. This approach is chosen because in the
proposed VC data model, a VC always links its previous VCs, not is
successors. Therefore, by moving backwards along the SC, the con-
nections between the VC will be more clear. After buying the batch of
batteries, the customer holds the VC battery-for-customer-vc. This VC
was issued by the battery retailer. The \"pre- viousCredential\" field
of this VC contains the CID of the VC battery-vc held by the battery
retailer. This VC was issued by the battery manufacturer. The
\"componentCredentials\" field of this VC contains the CIDs of both the
VC anode-vc and the VC cathode-vc. These VCs are held by the battery
manufacturer. These VCs were issued by the anode producer and cath- ode
producer respectively. The \"componentCredentials\" field of the VC
anode-vc contains the CID of the VC lithium-for-anodes-vc held by the
anode producer. This VC was issued by the lithium miner. Similarly, the
\"componentCredentials\" field of the VC cathode-vc contains the CID of
the VC lithium-for-cathodes-vc held by the cathode producer. This VC was
issued by the lithium miner. The \"certificateCredential\" field for
both of the previously described VCs contains the CID of the VC
mining-certificate-vc held by the lithium miner. This VC was is- sued by
the government ministry. The government ministry itself holds no VC and
is the trust anchor as the first issuer in the chain. Since the VCs are
always issued when a product is trans- ferred from a seller to a buyer,
the VC for a product produced by a company will not be held by the
company itself but instead by the buyer of that product. All of these
VCs are stored on IPFS and accessible via their CIDs on the IPFS pinning
service filebase.

> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image19.png){width="5.380937226596675in"
> height="2.987082239720035in"}
>
> []{#_bookmark62 .anchor}**Figure 4.4:** VCs for the products in the
> simplified model battery SC

### User Experience

> [4.5](#_bookmark64) and [4.6](#_bookmark65) show the UI of the
> application. At the top of the UI is the search bar with a search
> button. This is where the User can input an IPFS CID for a VC. This
> will trigger the fetching and verification of the VC as explained in
> 3.2.2. The image shows the UI after valid CID was input and the
> corresponding VC was fetched and verified. The first information
> regarding the VC that is displayed is the verification information for
> both the issuer and the holder of the VC. This information is
> presented first because it is essential for the user to verify the
> authenticity of the VC before examining the product details contained
> within it. The verification information presented corresponds to the
> three steps of verification explained in 3.5.2. \"Matching Content\"
> indicates whether the signed content represents the VC. \"Matching
> Signer\" verifies whether the DID of the JWT signer corresponds to the
> DID associated with their role in the VC. \"Signature Verified\"
> indicates whether the signature in the JWT is valid, confirming if the
> provided public key successfully verifies the signature. Additionally,
> the DIDs for both the issuer and the holder are displayed as part of
> their respective verification details.
>
> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image20.jpeg){width="4.669061679790026in"
> height="2.596248906386702in"}
>
> []{#_bookmark64 .anchor}**Figure 4.5:** Upper half of the UI after
> inputting a valid CID for a VC

Below the verification information, the product information is shown.
This includes infor- mation about the product name, the quantity and
batch number. The attributes mentioned here were simply chosen to
illustrate what potential information could be displayed. The product
information attributes could be arbitrarily changed in the VC model. The
VC also represents the issuer, holder, issuance date and transaction id.
These attributes are important for trans- parency and for tracing the
transaction related to the product represented by the VC on the ethereum
blockchain. Below the product information, the information about the
related cre- dentials is presented. This section contains three fields:
\"Previous Credential\", \"Component Credentials\" and \"License
Credential\". For every VC, only the fields that actually contain in-
formation are shown in the UI. Within these fields, the names of the
related VCs are displayed. Since the CID for these related VCs is
embedded in the VC, it can be utilized to link and re- trieve the
related VCs from IPFS. The related VCs therefore represent a clickable
link, that when clicked will again trigger the fetching and verification
of the clicked VC as explained in 3.2.2. This functionality enables the
user to go backwards through a products entire SC history. At the bottom
of the UI, a \"back\" button is shown. This button is only displayed if
other VCs were retrieved previously. IF clicked it will present the
verification information, product informa- tion and related credentials
for the previously displayed VC. The button enables the user to go back
through their entire search history. This UI structure is the same for
every product VC. For a license/certificate VC, the displayed
information is differs. Firstly, there is only one section of
verification information instead of two. This is because this type of VC
does not re- quire a \"holderProof\". Therefore, only the
\"issuerProof\" is verified and displayed. Secondly, the product
information section is replaced with the certificate information
section. This section presents the information contained within the VC.
Lastly, the section for related credentials does not exist for
license/certificate VCs. This is due to the fact that this type of
credential is the first in the SC and represents the trust anchor.

> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image21.jpeg){width="4.662083333333333in"
> height="6.56739501312336in"}
>
> []{#_bookmark65 .anchor}**Figure 4.6:** Lower half of the UI after
> inputting a valid CID for a VC

## Core Functionality

> In this section the most important functionality of the implementation
> will be explained. This encompasses the signing of VCs as well as the
> verification of VCs.

### Signing

In the following, the process of signing a VC is detailed. The function
**signVC()** is called with the parameters \"vcPath\", \"identityPath\"
and \"role\". The \"vcPath\" parameter contains the path to the local
storage location of the VC, \"identityPath\" contains the path to the
local storage location of the identity of the entity signing the VC. As
detailed in 4.1.4, the identity encompasses a public key, a private key,
an address and an identifier. The \"role\" variable indicates if the VC
is signed by the issuer or the holder. The VC is then read and stored in
the variable \"jsonData\". The \"proofs\" attribute is then removed and
the remaining content is stored in \"dataToSign\". This is because the
\"proofs\" attribute itself does not get signed. A \"signer\" is created
from the identity in the form of a DID by utilizing Ethr-Did
functionality. The \"signer\" then calls the Ethr-Did function
**signJWT()** on the \"dataToSign\" to generate the signature. The
\"signature\", \"signer\" and \"role\" are then added the \"proofs\"
attribute of the VC in either \"issuerProof\" or \"holderProof\"
according to the \"role\" attribute. The VC with the updated \"proofs\"
is then written back to its local storage location.

**Algorithm 1** Function to sign a VC

**function** SIGNVC(*vcPath*, *identityPath*, *role*) *jsonData ←*
readJsonFile(vcPath)

> *dataToSign ←* removeProofsSection(jsonData)
>
> *signer ←* getSigner(identityPath))
>
> *signature ←* signer.signJWT(dataToSign)
>
> *jsonDataWithProo f ←* addProofToData(jsonData, role, signature,
> signer) writeJsonFile(vcPath, jsonDataWithProof)

A certificate VC only has to be signed by the issuer to be valid, a
product VC would have to be signed by both the issuer and the holder to
be valid. The local storage of the VC and the identity are due to
constraints put on the implementation by the scope of the thesis and
might be implemented differently in a real world application. The
uploading of VCs to IPFS only happens after they are signed by all
parties.

### Verification

In the following, the process of verifying a VC is showcased. The
frontend sends a VC to the verify-vc endpoint in the backend with the
boolean \"isCertificate\" as an additional parameter. The backend
receives the request at the verify-vc endpoint and calls the
asynchronous function *verifyVC()* with both the VC and
\"isCertificate\" as parameters. Certificate VCs and product VCs differ
in the contents of their proofs attribute. For a product VC, both the
\"issuerProof\" and the \"holderProof\" are present in the proofs
attribute and both have to be verified. For a certificate VC there is no
\"holderProof\" section and therefore only the \"issuerProof\" section
is verified.

To verify an \"issuerProof\"/\"holderProof\" the backend calls the
function *verifyProof(proof, data- ToVerify, role)*. The \"role\"
parameter can be either issuer or holder and signifies which entity has
signed this proof. The \"proof\" parameter is the respective
\"issuerProof\"/\"holderProof\" at- tribute from the VC. The
\"dataToVerify\" is the VC without the \"proofs\" attribute, because the

> \"proofs\" attribute itself does not get signed. The Ethr-Did function
> *verifyJWT()* is called on the jws sections of the \"proof\"
> parameter. From the JWT payload, the content that was signed is
> extracted as well as the DID of the entity issuing the JWT. The
> signature part is verified and the verification result is stored in
> the boolean variable \"verified\". Afterwards, three verification
> steps are performed in the following order:

1.  The content that was signed in the JWT is compared to the
    \"dataToVerify\", which rep- resents the content of the VC. This
    comparison is important because in theory the JWT could contain any
    signed content. This means that without checking if the content of
    the JWT is equal to the VC, it would be possible for the issuer of
    the JWT to sign some unrelated content and pass it as a signature on
    the VC.

2.  The DID of the issuer of the JWT is compared to the DID in the
    \"verificationMethod\" of the \"issuerProof\"/\"holderProof\" and
    also compared to the DID of the given role for the VC. This ensures
    that the same entity that is represented as issuer or holder is also
    the entity signing the JWT. Without this check it would be possible
    to use a different DID with a different key pair to sign the JWT and
    pass it as a signature from the DID representing the holder/issuer
    given in the VC.

3.  The content of the boolean variable \"verified\" is checked. This
    determines whether the signature is valid, meaning if the given
    public key resolves the signature successfully.

> **Algorithm 2** Function to verify one proof from proofs section of a
> VC
>
> **function** VERIFYVC(*proo f* , *dataToVeri f y*, *role*) *veri f
> ied*, *vc*, *signer ←* verify(proof)
>
> **if**(*vc == dataToVerify*) **then** (*result.matchingvc ← true*)
>
> ***if**(signer == dataToVerify.role.id) **then**
> (result.matchingsigner ← true*)
>
> ***if**(verified == true) **then** (result.verified ← true*)
>
> *[**return** result]{.underline}*
>
> The boolean results of these verification steps are returned to the
> frontend for each proof section respectively. The order of
> verification steps was chosen according to their significance,
> although every verification step has to be successful to verify the
> VC.

## Development and Code Organization

> The development process for this thesis was started by working on the
> data model for the VC. With the first iteration of the data model, an
> example SC was set up. Afterwards, identity cre- ation and signing
> were implemented as scripts using the crypto library
> [7](#_bookmark70), which is a collection of cryptographic algorithms
> and the jose library [8](#_bookmark71), which offers functionality for
> JSON object signing and encryption. The VC data model was continually
> improved, with the main focus being the attributes of the related
> credentials. Next, the identity creation and signing scripts were
> refactored to use the Ethr-Did libraries detailed in 4.1.4. This
> library was also utilized in a script for VC verification. Following
> this, a basic frontend backend structure was set up. A
>
> 7 [[]{#_bookmark71 .anchor}]{#_bookmark70
> .anchor}https://github.com/crypto-js/crypto-js, accessed on 23
> September 2024
>
> 8 https://github.com/panva/jose, accessed on 23 September 2024

new example SC for a battery was set up with the improved VC data model.
The verification functionality was moved from the script to the backend
and the UI for showing the VC veri- fication information and product
information was implemented. In the last steps, the UI was improved, the
related Credentials section was implemented and the code was cleaned up.
This included the deletion of unused code and the writing of comments.

The code for this thesis is structured within a single repository. It is
organized into four distinct folders, each serving a specific purpose:

- **frontend**: Contains all code related to the UI, including
  components, styles, and neces- sary assets for frontend functionality.

- **backend**: Houses the server-side code responsible for processing
  requests for VC fetching and verification.

- **signing**: Includes scripts for DID identity creation and the
  signing of VCs.

- **VC Use Cases**: Contains the VCs for the battery example use case.
  These are the same VCs that are uploaded to IPFS.

This organized structure is beneficial due to the manageable complexity
of the code base for this thesis, as it allows for a comprehensive
overview within a single repository.

## Deployment

The frontend for this thesis runs locally on
[\"http://localhost:3000/\".](http://localhost:3000/) In a real world
imple- mentation, this frontend could operate as a website or be
developed as a mobile or desktop application. The backend for this
thesis runs locally on
[\"http://localhost:3001/\".](http://localhost:3001/) The func-
tionality for identity creation and signing is written as js scripts
which are manually executed using node. The creation of VCs and the
corresponding upload to IPFS is done manually. The implementation and
setup instructions can be found in the github repository. In a
real-world implementation, all processes that were performed manually
due to the scope of this thesis would need to be automated. Furthermore,
these automated processes would have to be di- rectly integrated into
business transactions.

# Evaluation

> In this chapter, the solution proposed and implemented in this thesis
> is evaluated. The research question posed in the motivation section
> will be addressed. The solution proposed in this thesis will be
> evaluated in relation to the hypotheses outlined in the motivation
> section. The performance of the solution will be measured.
> Furthermore, the solution of this thesis will be compared to similar
> solutions proposed by other authors.

## Solution Validation

> The research question posed in the motivation section of this thesis
> was: \"Is it possible to trace a products SC by utilizing VCs in a
> blockchain based system?\" Four hypotheses were formulated in relation
> to the research question. This section will assess the extent to which
> the developed model aligns with each of these hypotheses.
>
> **Hypothesis 1:** The proposed model can chain VCs that are issued for
> products. The chaining is done in a way that allows access from a VC
> to its predecessor. This hypothesis is important to enable
> traceability.
>
> The proposed model aligns with hypothesis 1. This is ensured by the
> attributes of the VC model described in 3.4.2 as related credentials.
> The \"previousCredential\" attribute is used in case the product was
> bought and sold by the previous owner in an unchanged way. It contain
> an IPFS CID that refers to the VC of the product as it was sold from
> the previous seller to the current seller. The
> \"componentCredentials\" attribute is used in case the product was
> manufactured from component products. It contain a list of IPFS CIDs
> that refer to the VCs of the component products that were used by the
> current seller to manufacture or assemble the product. These
> representations of the related credentials implement a chaining of a
> VC to its predecessor or predecessors. As explained in 4.1.5, the IPFS
> CIDs can be accessed by using the public IPFS gateway provided by
> Filebase. This ensures that the chaining is done in a way that allows
> ac- cess from one VC to its predecessor or predecessors.
>
> **Hypothesis 2:** The proposed model allows for products to be
> transformed or processed into different products. This hypothesis is
> important for the tracing of manufactured products.
>
> The proposed model aligns with hypothesis 2. This is ensured by the
> the \"componentCreden- tials\" attribute of the VC model described in
> 3.4.2. As stated before, this attribute contains IPFS CIDs and names
> for a list of VCs which represent the components used to manufacture
> the product represented by the current VC. Therefore the proposed
> model allows for products to be transformed or processed into
> different products.

**Hypothesis 3:** The proposed model can be cryptographically verified.
This hypothesis is im-

31

portant to create trust in the model.

The proposed model aligns with hypothesis 3. As described in 3.4.3, the
proofs section of the VC data model contains a JWT which in turn
contains a digital signature. This JWT and digi- tal signature are
present for both the holder and the issuer. As explained in 3.5.1, the
ECDSA Secp256k1 algorithm is used for the signing and verification of
the VCs. ECDSA is an algo- rithm based on elliptic curve cryptography
[\[50\].](#_bookmark133) This ensures that the proposed model can be
cryptographically verified.

**Hypothesis 4:** The proposed model is non-repudiable and immutable.
This hypothesis is im- portant for building trust in the model and is
necessary for real world usage.

The proposed model aligns with hypothesis 4. As stated before, digital
signatures using a cryptographic algorithm are used to sign the VCs
following the proposed model. As stated in 2.2.1 the usage of digital
signatures allows for control of ownership and therefore non-
repudiation [\[14\].](#_bookmark97) Consequently, the proposed model is
non-repudiable. There are several fac- tors contributing to the
immutability of the proposed model. The most important factor is the
inclusion of the \"transactionId\" attribute in the VC data model. As
described in 3.4.1, the \"trans- actionId\" attribute contains a
transaction id for a transaction on the ethereum blockchain. This
transaction can be used to compare the details contained within the
transaction to the details contained within the VC. Most importantly the
DIDs of the participants can verified in this way. Furthermore, certain
product information contained within the VC can also be verified via the
transaction. As the transactions in the ethereum blockchain out of scope
for this thesis, they are not implemented and the contents are assumed.
If details of the VC would be tampered with, the transaction id would
also have to be changed and a new transaction containing fitting
information would have to be created. This acts as one factor
contributing to the immutability of the model. Secondly, as described in
3.4.3, every VC is digitally signed by the holder and the issuer. Any
changes to a VC would therefore make these signatures invalid. Tampering
with details of the VC would consequently require both the issuer and
the holder of the VC to sign the new tampered version of the VC. This
acts as an additional factor contributing to the im- mutability of the
model. Lastly, as described in 4.1.5, in the proposed model the VCs are
stored on IPFS. As explained in 2.4, files in IPFS are content
addressable by their CID [\[37\].](#_bookmark120) This means that
changing the contents of a VC would require a new upload to IPFS under a
different CID. In the proposed data model, a VC links to its predecessor
VC or VCs via their IPFS CID. This means that if one VC would be
tampered with and uploaded under a new CID, the VCs suc- ceeding that
tampered VC in the SC would still link to the original unchanged VC.
Therefore to successfully tamper with a VC, all VCs down the SC would
also have to be tampered with and uploaded to IPFS under new CID to
contain the updated CID of their predecessor. This acts as an additional
factor contributing to the immutability of the model. While in theory it
is not impossible to tamper with a VC in the proposed model, the
safeguards described lead the author to state that it is practically
impossible to tamper with a VC, making it immutable.

## Performance

In this section the the performance of the application is evaluated. To
measure performance, the time was recorded from the moment the frontend
sends a request to fetch VC to the back- end. The backend then returns
the VC, and the frontend sends a request to verify the VC back to the
backend. The backend responds with the verification details. The time
measurement

> was stopped when the response with the verification details was
> received in the frontend. This process provides an accurate assessment
> of the total time taken for both data retrieval and verification in
> the system, including the communication delay between the frontend and
> the backend. Measurements were conducted for three distinct types of
> VC: a product VC, a cer- tificate VC, and a product VC for which
> verification was unsuccessful. For each VC type, the process duration
> was measured twenty times. The resulting data was analyzed and
> presented using a box plot to visualize the distribution of
> verification times across the three different rep- resented VC types.
>
> The mean processing time for a valid product VC was 1769.80 ms, with
> the quartiles lying at 1636.00 (Q1) ms and 1828.25 ms (Q3), see
> [5.1.](#_bookmark76) The whiskers, which extend from the box, rep-
> resent the range of the data outside the interquartile range,
> excluding outliers. The whiskers extend to values near 1500 ms and
> 2000 ms. There also is one significant outlier at approxi- mately 2700
> ms.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image22.png){width="3.11375in"
height="2.2690616797900263in"}

> []{#_bookmark76 .anchor}**Figure 5.1:** Performance data for a product
> VC
>
> The mean processing time for an invalid product VC was 1690.25 ms,
> with the quartiles lying at 1533.75 ms (Q1) and 1685.00 ms (Q3), see
> [5.2.](#_bookmark77) The whiskers extend to values near 1400 ms and
> 1800 ms. Additionally, there are two significant outliers at
> approximately 2300 ms and 2600 ms. The data shows that the processing
> time for a valid a product VC is similar to the processing time of a
> product VC for which verification was unsuccessful. This matches the
> authors expectations, as the fetching and verification has to be
> performed equally for both types of VCs. The spread is slightly higher
> for a valid VC. The presence of outliers in the data cannot be
> definitively explained. However, a plausible hypothesis is that they
> result from fluctuations in communication times between the frontend
> and backend or delays encountered when the backend retrieves the VC
> from IPFS.
>
> ![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image23.png){width="3.11375in"
> height="2.2690616797900263in"}

[]{#_bookmark77 .anchor}**Figure 5.2:** Performance data for an invalid
product VC

The mean processing time for a certificate VC was 869.15 ms, with the
quartiles at 819.75 ms (Q1) and 908.50 ms (Q3). The whiskers extend to
values near 750 ms and 950 ms, see

[5.3.](#_bookmark78) Additionally, there is one notable outlier at
approximately 1100 ms. The processing time for a certificate VC is
significantly lower than the processing time for a product VC, being
approximately half as long. This can be explained by two factors.
Firstly, the size of the product VC used for testing is around 4.5 Kb
while the size of the certificate VC used for testing is around half
that at 2.4 Kb. This might shorten the time needed for fetching and
transferring the VC. Secondly, as explained in 3.4.3, the certificate VC
does only not include the \"holderProof\" attribute. This means that the
time needed for verification should also be shorter than for a product
VC, since only the \"issuerProof\" section has to be verified.

![](C:\Users\yamen\ev-battery-supplychain\docs\references\Abschlussarbeit_381812-media/media/image24.png){width="3.11375in"
height="2.2690616797900263in"}

[]{#_bookmark78 .anchor}**Figure 5.3:** Performance data for a
certificate VC

As the processed that were measured are executed every time a VC is
displayed in the fron- tend, the performance is relevant for the user
experience. We believe that a loading time of ap- proximately one to two
seconds is acceptable for a good user experience. One limitation of the
performance measurement is the relatively small sample size. While the
results demonstrate a degree of stability, an increased sample size
would provide a more robust and conclusive

> representation of the findings. Another limitation is the fact that
> the frontend and backend are running locally on the same machine as
> described in 4.4 and are not experiencing a high work- load. This
> would of course be different in a real world implementation and would
> most likely impact the performance.

## State of the Art Comparison

> In this section the proposed solution for this thesis will be compared
> to other solutions for SC provenance that were reviewed in 2.5.
> Important differences and resulting benefits or disad- vantages will
> be highlighted.
>
> As stated in 3.4, the VC data model proposed in this thesis in mainly
> based on the VC interop- erability model proposed by Yeray et al. One
> major difference is that in the model proposed in this thesis, the VCs
> represented in the related credentials explained in 3.4.2 are
> represented as CIDs. On the other hand, in the model proposed by Yeray
> et al, the \"relatedCredentials\" and \"previousCredential\"
> attributes contain these respective VCs in their entirety
> [\[41\].](#_bookmark124) As a result, each VC in the chain increases
> in size, since it encapsulates the full data of all preceding VCs in
> the SC, nested within these attributes. In the best case scenario
> regarding this growth in size, a product would be sold along the SC
> without ever being manufactured into a different product. This would
> cause the \"previousCredential\" attribute to contain a linear history
> of the product's entire SC, leading to a proportional linear increase
> in the size of the VC. However, such a straightforward SC seems to be
> generally unrealistic, except for specific products like for example
> fruit or vegetables intended for whole consumption. The SC for most
> products would likely involve multiple stages where components are
> manufactured into new products several times before the final product
> is created. This would lead to an exponential growth in the size of
> VCs. In the model proposed by Yeray et al., the average size of the
> first VC in a SC is approximately 2KB, according to the repository
> given in their work [\[41\].](#_bookmark124) Assuming a SC with 10
> steps, where 4 component products are combined at each stage to create
> a new product, the resulting VC size would grow to approximately 2GB.
> The storage, transfer, and resolution of VCs of this size could place
> significant strain on the resources of SC participants. In contrast,
> the solution proposed in this thesis avoids this issue. Instead of
> embedding the VCs from ear- lier stages directly within the current
> VC, they are linked via CIDs. As a result, the complexity of the
> product's SC does not impact the size of the VC. The size is nearly
> constant and does not grow along the SC. The presentation of these
> related VC as CIDs therefore offers a major advantage compared to the
> model proposed by Yeray et al.
>
> Another difference to the model proposed by Yeray et al. is that VCs
> are issued at different events. In this thesis a VC is only issued
> when a product is sold. In their work on the other hand, a new VC is
> issued when a product is created as well as when a product is sold
> [\[41\].](#_bookmark124) For a VC issued after product creation, the
> issuer and holder are identical and are represented by the company
> creating the product. This means that the \"issuerProof\" and the
> \"holderProof\" attributes contain the same signature. When a created
> product is sold, the VC for the transac- tion contains identical
> product information and is largely redundant to the VC issued during
> product creation. The main difference is that the \"holderProof\" now
> contains the signature of the buyer. One advantage of the model
> proposed in this thesis is that it removes the described redundancies
> from the chain of VCs. This also improves traceability, since the
> removal of the described redundant VCs does not cause any loss of
> information, but makes the chain of VCs shorter and more clear.
> Furthermore, any product VC issued is guaranteed to have two dis-

tinct entities as the issuer and the holder, represented by the seller
and buyer respectively. As described in 3.4.3, this is beneficial
because it ensures mutual agreement on the contents of the VC. One
potential disadvantage of the model proposed in this thesis is that for
newly created products that are not sold yet lack a corresponding VC.
This limitation becomes particularly significant in cases where a
product is never sold, as it would result in the absence of a VC
representing that product.

Another difference is that the model proposed by Yeray et al includes
schema for its newly introduced attributes. Due to the scope of this
thesis, no schema formalizing the description of the newly introduced
attributes are included in the thesis.

As described in 2.5.2, in the concept proposed by Westerkamp et al
[\[45\],](#_bookmark128) products are repre- sented by tokens created
through smart contracts. Compared to the solution proposed in this
thesis, their solution offers a higher amount of automation. In this
thesis, every VC for a prod- uct is issued manually as opposed to tokens
being created via smart contracts. Furthermore, when creating new
products from components, the tokens representing the component prod-
ucts are automatically consumed by the respective smart contract. In the
solution done by this thesis, this is again done manually. This also
leads to a higher risk of fraud or error. A VC could in theory be used
several times as a \"componentCredential\" in manufactured VCs, even
though the real world product could of course only be used once for
manufacturing a new product. This scenario cannot occur in the solution
proposed by Westerkamp et al, as product tokens are automatically
consumed when used for manufacturing other products.

## Result

As demonstrated in 5.1, the proposed VC data model verifies all four of
the proposed hypothe- ses summarized as: (1) VCs issued for products can
be chained; (2) products can be transformed or processed; (3) the model
can be cryptographically verified; (4) the model is non-repudiable and
immutable. Regarding the research question it can be concluded that it
is possible to trace a products SC by utilizing VCs in a blockchain
based system.

The proposed vc data model offers key improvements over comparable
solutions like the one proposed by Yeray et al [\[41\].](#_bookmark124)
One improvement is the representation of related VCs as CIDs. This
solves the potential issue of exponential growth of VCs along the SC.
Another improve- ment is the design decision to only issue product VCs
when products are sold, not when prod- ucts are created. This removes
redundancies and guarantees that every VC has two distinct entities as
the issuer and the holder.

The representation of products as VCs, rather than as tokens created by
smart contracts, as pro- posed by Westerkamp et al.
[\[45\],](#_bookmark128) introduces a significant limitation. This
limitation arises from the reduced automation in handling
product-related processes. As a result, there is increased potential for
human error or fraud due to the greater reliance on manual procedures.

This is closely related to what we believe is the biggest limitation of
this thesis. Due to the scope of the thesis, many aspects were
simplified, done manually or assumed. This was necessary to keep the
complexity of the thesis within a reasonable frame. Certain attributes
within the VCs in the example use case are filled with dummy data. There
is no automated process for creating VCs and the identity creation and
signing are also done via scripts instead of integration into a broader
architecture. Most importantly it is assumed that all transactions in a
SC are done via smart contracts and that the transactions contain
relevant product information as well as DIDs for the transaction
participants. Without this assumption the fourth hypothesis cannot be

> verified.
>
> Another limitation encountered during the development of this thesis
> was the challenge of finding suitable tools for identity creation and
> management, including signing and verifica- tion of signatures. Many
> available libraries and tools either lacked a comprehensive solution
> for managing DIDs or were deprecated, no longer maintained, or
> outdated. Ultimately the Ethr-Did library was chosen as explained in
> 4.1.4, which provided the functionality needed for the implementation.
> However, the difficulty in identifying reliable and up-to-date tools
> significantly impacted the time required to complete the
> implementation phase of the project.

# Conclusion

> The goal of this thesis was to enhance transparency and traceability
> in the modern SC. As we demonstrated, these qualities become both
> increasingly complex to achieve and increasingly important for all
> stakeholders in the SC.
>
> The research question of this thesis was: \"Is it possible to trace a
> products SC by utilizing VCs in a blockchain based system?\" This
> thesis set out to answer this question by proposing data model for
> receipts as VCs that represent products. Additionally, functionality
> for signing and verification of these VCs was implemented. In order to
> achieve this, digital identities were pro- posed and implemented for
> all stakeholder interacting with the VCs. Furthermore, a UI was
> implemented for displaying information contained within the VCs to the
> public in an accessi- ble way. The VC data model was applied in a use
> case demonstration by modeling an example SC for a battery and
> creating all necessary VCs along the SC. The proposed VC data model
> represents the core of this thesis. As explained in 5.4, the proposed
> VC data model provides an answer to the research question: It is
> possible to trace a products SC by utilizing VCs in a blockchain based
> system. The proposed VC data model allows for VCs to be chained,
> allows for product transformation, can be cryptographically verified
> and is non-repudiable and im- mutable.
>
> The proposed VC data model makes significant improvements compared to
> other similar VC data models while having disadvantages compared to
> smart contract based solutions.
>
> For future work, it would be valuable to implement the elements that
> were mocked or assumed due to the scope limitations of this thesis.
> This encompasses the introduction of a schema for the proposed VC data
> model. Additionally this could include the implementation of a more
> comprehensive system for identity creation, VC creation and the
> signing of VCs. Most impor- tantly, combining the VCs with actualized
> smart contract transactions would be useful to test the real world
> feasibility of the proposed solution.
>
> Overall, this thesis proves that VCs can be utilized to trace a
> products SC in a blockchain based system. Increased transparency and
> traceability are both necessary and beneficial to SC stake- holders
> and receipts as VCs representing products offer a viable solution to
> achieving these objectives.

# List of Figures

1.  [Simplified example of a DID string](#_bookmark14) 6

2.  [Overview of a typical DID architecture according to W3C
    standard](#_bookmark15) 7

3.  [Overview of different roles associated with a VC](#_bookmark17) 7

4.  [Simple example VC according to W3C standard](#_bookmark18) 8

<!-- -->

1.  [Flow of data between the architectural components](#_bookmark29) 13

2.  [issuer and holder attributes of the proposed VC](#_bookmark35) 15

3.  [previousCredential attribute of the proposed VC](#_bookmark38) 16

4.  [componentCredentials attribute of the proposed VC](#_bookmark39) 17

5.  [certificateCredential attribute of the proposed VC](#_bookmark40)
    17

6.  [proofs attribute of the proposed VC](#_bookmark42) 18

<!-- -->

1.  [Output of the Ethr-Did *createKeyPair()* method](#_bookmark55) 21

2.  [Basic DID document built from a DID by the
    Ethr-Did-Resolver](#_bookmark56) 22

3.  [Simplified model SC for a battery](#_bookmark61) 24

4.  [VCs for the products in the simplified model battery
    SC](#_bookmark62) 25

5.  [Upper half of the UI after inputting a valid CID for a
    VC](#_bookmark64) 26

6.  [Lower half of the UI after inputting a valid CID for a
    VC](#_bookmark65) 27

<!-- -->

1.  [Performance data for a product VC](#_bookmark76) 33

2.  [Performance data for an invalid product VC](#_bookmark77) 34

3.  [Performance data for a certificate VC](#_bookmark78) 34

# Bibliography

1.  []{#_bookmark84 .anchor}D. DiMase, Z. A. Collier, J. Carlson, R. B.
    Gray Jr, and I. Linkov, "Traceability and risk analysis strategies
    for addressing counterfeit electronics in supply chains for complex
    systems," *Risk* []{#_bookmark85 .anchor}*Analysis*, vol. 36, no.
    10, pp. 1834--1843, 2016.

2.  D. M. Lambert and M. G. Enz, "Issues in supply chain management:
    Progress and potential,"

> []{#_bookmark86 .anchor}*Industrial marketing management*, vol. 62,
> pp. 1--16, 2017.

3.  S. Saberi, M. Kouhizadeh, J. Sarkis, and L. Shen, "Blockchain
    technology and its relationships to sustainable supply chain
    management," *International journal of production research*, vol.
    57, no. 7,

> []{#_bookmark87 .anchor}pp. 2117--2135, 2019.

4.  S. Sarpong, "Traceability and supply chain complexity: confronting
    the issues and concerns,"

> []{#_bookmark88 .anchor}*European Business Review*, vol. 26, no. 3,
> pp. 271--284, 2014.

5.  Z. A. Collier and J. Sarkis, "The zero trust supply chain: Managing
    supply chain risk in the []{#_bookmark89 .anchor}absence of trust,"
    *International Journal of Production Research*, vol. 59, no. 11, pp.
    3430--3445, 2021.

6.  Official Journal of the European Union, "Eu critical raw resources
    regulation," 2024, accessed: 2024-07-15. \[Online\]. Available:
    [https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ%3AL_202401252)

> []{#_bookmark90
> .anchor}[?uri=OJ:L_202401252](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ%3AL_202401252)

7.  O. J. of the European Union, "Eu batteries regulation," 2024,
    accessed: 2024-07-15. \[Online\].

> []{#_bookmark91 .anchor}Available:
> [https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32023R1542](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32023R1542)

8.  B. J. La Londe and J. M. Masters, "Emerging logistics strategies:
    blueprints for the next century,"

[]{#_bookmark92 .anchor}*International journal of physical distribution
& logistics management*, vol. 24, no. 7, pp. 35--47, 1994.

9.  D. J. Thomas and P. M. Griffin, "Coordinated supply chain
    management," *European journal of* []{#_bookmark93
    .anchor}*operational research*, vol. 94, no. 1, pp. 1--15, 1996.

10. J. T. Mentzer, W. DeWitt, J. S. Keebler, S. Min, N. W. Nix, C. D.
    Smith, and Z. G. Zacharia, []{#_bookmark94 .anchor}"Defining supply
    chain management," *Journal of Business logistics*, vol. 22, no. 2,
    pp. 1--25, 2001.

11. H. Fang, F. Fang, Q. Hu, and Y. Wan, "Supply chain management: A
    review and bibliometric []{#_bookmark95 .anchor}analysis,"
    *Processes*, vol. 10, no. 9, p. 1681, 2022.

12. F. Rahman, C. Titouna, and F. Nait-Abdesselam, "Fundamentals of
    blockchain and smart con- tracts," in *Blockchain and Smart-Contract
    Technologies for Innovative Applications*. Springer, 2024,

> []{#_bookmark96 .anchor}pp. 3--37.

13. A. Sunyaev and A. Sunyaev, "Distributed ledger technology,"
    *Internet computing: Principles of* []{#_bookmark97
    .anchor}*distributed systems and emerging internet-based
    technologies*, pp. 265--299, 2020.

14. N. El Ioini and C. Pahl, "A review of distributed ledger
    technologies," in *On the Move to Meaning- ful Internet Systems. OTM
    2018 Conferences: Confederated International Conferences: CoopIS,
    C&TC, and ODBASE 2018, Valletta, Malta, October 22-26, 2018,
    Proceedings, Part II*. Springer, 2018, pp. 277--288.

15. []{#_bookmark98 .anchor}R. L. Rivest, A. Shamir, and L. Adleman, "A
    method for obtaining digital signatures and public- []{#_bookmark99
    .anchor}key cryptosystems," *Communications of the ACM*, vol. 21,
    no. 2, pp. 120--126, 1978.

16. N. Koblitz, "Elliptic curve cryptosystems," *Mathematics of
    Computation*, vol. 48, no. 177, pp. 203-- []{#_bookmark100
    .anchor}209, 1987.

17. []{#_bookmark101 .anchor}S. Josefsson and I. Liusvaara,
    "Edwards-curve digital signature algorithm (eddsa)."

18. M. Zachariadis, G. Hileman, and S. V. Scott, "Governance and control
    in distributed ledgers: Understanding the challenges facing
    blockchain technology in financial services," *Information*
    []{#_bookmark102 .anchor}*and organization*, vol. 29, no. 2, pp.
    105--117, 2019.

19. K. Christidis and M. Devetsikiotis, "Blockchains and smart contracts
    for the internet of things,"

> []{#_bookmark103 .anchor}*IEEE access*, vol. 4, pp. 2292--2303, 2016.

20. S. M. H. Bamakan, A. Motavali, and A. B. Bondarti, "A survey of
    blockchain consensus algo- rithms performance evaluation criteria,"
    *Expert Systems with Applications*, vol. 154, p. 113385,
    []{#_bookmark104 .anchor}2020.

21. D. Mingxiao, M. Xiaofeng, Z. Zhe, W. Xiangwei, and C. Qijun, "A
    review on consensus algo- rithm of blockchain," in *2017 IEEE
    international conference on systems, man, and cybernetics (SMC)*.
    []{#_bookmark105 .anchor}IEEE, 2017, pp. 2567--2572.

22. A. Gervais, G. O. Karame, K. Wüst, V. Glykantzis, H. Ritzdorf,
    and S. Capkun, "On the secu- rity and performance of proof of work
    blockchains," in *Proceedings of the 2016 ACM SIGSAC*
    []{#_bookmark106 .anchor}*conference on computer and communications
    security*, 2016, pp. 3--16.

23. S. M. S. Saad and R. Z. R. M. Radzi, "Comparative review of the
    blockchain consensus algo- rithm between proof of stake (pos) and
    delegated proof of stake (dpos)," *International Journal of*
    []{#_bookmark107 .anchor}*Innovative Computing*, vol. 10, no. 2,
    2020.

24. W. Zou, D. Lo, P. S. Kochhar, X.-B. D. Le, X. Xia, Y. Feng, Z. Chen,
    and B. Xu, "Smart contract development: Challenges and
    opportunities," *IEEE transactions on software engineering*, vol.
    47, []{#_bookmark108 .anchor}no. 10, pp. 2084--2106, 2019.

25. []{#_bookmark109 .anchor}V. Buterin *et al.*, "Ethereum white
    paper," *GitHub repository*, vol. 1, pp. 22--23, 2013.

26. A. Singh, R. M. Parizi, Q. Zhang, K.-K. R. Choo, and A.
    Dehghantanha, "Blockchain smart con- tracts formalization:
    Approaches and challenges to address vulnerabilities," *Computers &
    Secu-* []{#_bookmark110 .anchor}*rity*, vol. 88, p. 101654, 2020.

27. E. Kapengut and B. Mizrach, "An event study of the ethereum
    transition to proof-of-stake,"

> []{#_bookmark111 .anchor}*Commodities*, vol. 2, no. 2, pp. 96--110,
> 2023.

28. Y. Ucbas, A. Eleyan, M. Hammoudeh, and M. Alohaly, "Performance and
    scalability analysis of []{#_bookmark112 .anchor}ethereum and
    hyperledger fabric," *IEEE Access*, 2023.

29. A. Mühle, A. Grüner, T. Gayvoronskaya, and C. Meinel, "A survey on
    essential components of []{#_bookmark113 .anchor}a self-sovereign
    identity," *Computer Science Review*, vol. 30, pp. 80--86, 2018.

30. M. S. Ferdous, F. Chowdhury, and M. O. Alassafi, "In search of
    self-sovereign identity leveraging []{#_bookmark114
    .anchor}blockchain technology," *IEEE access*, vol. 7, pp. 103
    059--103 079, 2019.

31. Q. Stokkink and J. Pouwelse, "Deployment of a blockchain-based
    self-sovereign identity," in *2018 IEEE international conference on
    Internet of Things (iThings) and IEEE green computing and
    communications (GreenCom) and IEEE cyber, physical and social
    computing (CPSCom) and IEEE smart data (SmartData)*. IEEE, 2018, pp.
    1336--1342.

*6 Bibliography* **45**

32. []{#_bookmark115 .anchor}C. Allen. (2016) The path to self-sovereign
    identity. \[Online\]. Available:
    [https://www.](https://www.lifewithalacrity.com/article/the-path-to-self-soverereign-identity)
    []{#_bookmark116
    .anchor}[lifewithalacrity.com/article/the-path-to-self-soverereign-identity](https://www.lifewithalacrity.com/article/the-path-to-self-soverereign-identity)

33. World Wide Web Consortium, "Decentralized identifiers (dids) v1.0,"
    W3C, 2022, accessed: []{#_bookmark117 .anchor}2024-07-12.
    \[Online\]. Available: <https://www.w3.org/TR/did-core/>

34. Z. A. Lux, D. Thatmann, S. Zickau, and F. Beierle,
    "Distributed-ledger-based authentication with decentralized
    identifiers and verifiable credentials," in *2020 2nd Conference on
    Blockchain Research* []{#_bookmark118 .anchor}*& Applications for
    Innovative Networks and Services (BRAINS)*. IEEE, 2020, pp. 71--78.

35. World Wide Web Consortium, "Did specification registries," W3C,
    2024, accessed: 2024-07-12. []{#_bookmark119 .anchor}\[Online\].
    Available: <https://w3c.github.io/did-spec-registries/>

36. ------, "Verifiable credentials data model v1.1," W3C, 2022,
    accessed: 2024-07-12. \[Online\].

> []{#_bookmark120 .anchor}Available:
> <https://www.w3.org/TR/vc-data-model/>

37. J. Benet, "Ipfs-content addressed, versioned, p2p file system (draft
    3)," *arXiv preprint* []{#_bookmark121 .anchor}*arXiv:1407.3561*,
    pp. 1--11, 2014.

38. M. Naz, F. A. Al-zahrani, R. Khalid, N. Javaid, A. M. Qamar, M. K.
    Afzal, and M. Shafiq, "A secure data sharing platform using
    blockchain and interplanetary file system," *Sustainability*,
    []{#_bookmark122 .anchor}vol. 11, no. 24, p. 7054, 2019.

39. N. Nizamuddin, H. R. Hasan, and K. Salah, "Ipfs-blockchain-based
    authenticity of online publi- cations," in *Blockchain--ICBC 2018:
    First International Conference, Held as Part of the Services Confer-
    ence Federation, SCF 2018, Seatt"Achieving un sdgs in food supply
    chain using blockchain technologyle,* []{#_bookmark123 .anchor}*WA,
    USA, June 25-30, 2018, Proceedings 1*. Springer, 2018, pp. 199--212.

40. A. Chandan, M. John, and V. Potdar, "Achieving un sdgs in food
    supply chain using blockchain []{#_bookmark124 .anchor}technology,"
    *Sustainability*, vol. 15, no. 3, p. 2109, 2023.

41. Y. Mezquita, B. Podgorelec, A. B. Gil-González, and J. M. Corchado,
    "Blockchain-based supply chain systems, interoperability model in a
    pharmaceutical case study," *Sensors (Basel, Switzer-*
    []{#_bookmark125 .anchor}*land)*, vol. 23, no. 4, 2023.

42. E. Da Ribeiro Silva, J. Lohmer, M. Rohla, and J. Angelis,
    "Unleashing the circular economy in the electric vehicle battery
    supply chain: A case study on data sharing and blockchain
    potential," []{#_bookmark126 .anchor}*Resources, Conservation and
    Recycling*, vol. 193, p. 106969, 2023.

43. J. Sunny, N. Undralla, and V. Madhusudanan Pillai, "Supply chain
    transparency through blockchain-based traceability: An overview with
    demonstration," *Computers & Industrial En-* []{#_bookmark127
    .anchor}*gineering*, vol. 150, p. 106895, 2020.

44. O. J. of the European Union, "General data protection regulation,"
    2016, accessed: 2024-07-

> 19\. \[Online\]. Available:
> [https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L:2016:119:](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ%3AL%3A2016%3A119%3ATOC)
> []{#_bookmark128
> .anchor}[TOC](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ%3AL%3A2016%3A119%3ATOC)

45. M. Westerkamp, F. Victor, and A. Küpper, "Tracing manufacturing
    processes using blockchain- []{#_bookmark129 .anchor}based token
    compositions," *Digital Communications and Networks*, vol. 6, no. 2,
    pp. 167--176, 2020.

46. Q. Wang, R. Li, Q. Wang, and S. Chen, "Non-fungible token (nft):
    Overview, evaluation, oppor- []{#_bookmark130 .anchor}tunities and
    challenges," *arXiv preprint arXiv:2105.07447*, 2021.

47. D. Hardman and L. Harchandani. (2019) Aries rfc 0104: Chained
    credentials. \[Online\]. Available:
    [https://github.com/hyperledger/aries-rfcs/blob/main/concepts/0104-chained-](https://github.com/hyperledger/aries-rfcs/blob/main/concepts/0104-chained-credentials/README.md)
    [credentials/README.md](https://github.com/hyperledger/aries-rfcs/blob/main/concepts/0104-chained-credentials/README.md)

48. []{#_bookmark131 .anchor}H. S. Oluwatosin, "Client-server model,"
    *IOSR Journal of Computer Engineering*, vol. 16, no. 1, pp.
    []{#_bookmark132 .anchor}67--71, 2014.

49. S. Pote, V. Sule, and B. Lande, "Arithmetic of koblitz curve
    secp256k1 used in bitcoin cryptocur- rency based on one variable
    polynomial division," in *2nd International Conference on Advances
    in* []{#_bookmark133 .anchor}*Science & Technology (ICAST)*, 2019.

50. D. Johnson, A. Menezes, and S. Vanstone, "The elliptic curve digital
    signature algorithm []{#_bookmark134 .anchor}(ecdsa),"
    *International Journal of Information Security*, vol. 1, no. 1, pp.
    36--63, 2001.

51. []{#_bookmark135 .anchor}W. Stallings, "Digital signature
    algorithms," *Cryptologia*, vol. 37, no. 4, pp. 311--327, 2013.

52. []{#_bookmark136 .anchor}C. Gackenheimer, *Introduction to React*.
    Apress, 2015.

53. P. Braendgaard and T. Joel, "Eip-1056: Ethereum lightweight
    identity," *Ethereum Improvement* []{#_bookmark137
    .anchor}*Proposals. URL: https://eips. ethereum. org/EIPS/eip-1056
    (besucht am 15. 01. 2022)*, 2018.

54. []{#_bookmark138 .anchor}M. Jones, J. Bradley, and N. Sakimura, "Rfc
    7519: Json web token (jwt)," 2015.

55. L. Balduf, M. Korczyn´ski, O. Ascigil, N. V. Keizer, G. Pavlou, B.
    Scheuermann, and M. Król, "The cloud strikes back: Investigating the
    decentralization of ipfs," in *Proceedings of the 2023 ACM on
    Internet Measurement Conference*, 2023, pp. 391--405.
