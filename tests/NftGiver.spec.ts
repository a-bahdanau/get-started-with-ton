import { NftGiver, NftGiverConfig, Queries } from '../wrappers/NftGiver';
import { beginCell, Cell } from '@ton/ton';
import { unixNow } from '../lib/utils';
import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { randomAddress } from '@ton/test-utils';

const OWNER_ADDRESS = randomAddress();
const ROYALTY_ADDRESS = randomAddress();

const defaultConfig: NftGiverConfig = {
    ownerAddress: OWNER_ADDRESS,
    nextItemIndex: 777n,
    collectionContent: 'collection_content',
    commonContent: 'common_content',
    nftItemCode: Cell.EMPTY,
    royaltyParams: {
        royaltyFactor: 100n,
        royaltyBase: 200n,
        royaltyAddress: ROYALTY_ADDRESS
    },
    powComplexity: 0n,
    lastSuccess: 0n,
    seed: 0n,
    targetDelta: 15n * 60n, // 15 minutes
    minComplexity: 240n,
    maxComplexity: 252n
};

describe('NftGiver', () => {
    let NftGiverCode: Cell;

    beforeAll(async () => {
        NftGiverCode = await compile('NftGiver');
    });

    let blockchain: Blockchain;

    let sender: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        sender = await blockchain.treasury('sender');
    });

    it('should mine new nft', async () => {
        const receiver = randomAddress();
        const now = unixNow();

        const params = {
            expire: now + 30,
            mintTo: receiver,
            data1: 0n,
            seed: defaultConfig.seed
        };
        const hash = Queries.mine(params).hash();

        const config = {
            ...defaultConfig,
            powComplexity: BigInt('0x' + hash.toString('hex')) + 1n,
            lastSuccess: BigInt(now - 30)
        };

        const collection = blockchain.openContract(NftGiver.createFromConfig(config, NftGiverCode));
        blockchain.now = now;

        const res = await collection.sendMineNft(sender.getSender(), params);

        // As a result of mint query, collection contract should send stateInit message to NFT item contract
        let nftItemData = beginCell()
            .storeUint(config.nextItemIndex, 64)
            .storeAddress(collection.address)
            .endCell();

        expect(res.transactions).toHaveTransaction({
            success: true,
            deploy: true,
            initCode: config.nftItemCode,
            initData: nftItemData
        });

        const miningData = await collection.getMiningData();

        expect(miningData.powComplexity >= (1n << config.minComplexity)).toBeTruthy();
        expect(miningData.powComplexity <= (1n << config.maxComplexity)).toBeTruthy();
    });

    //
    // it('should not mine new nft when POW is not solved', async () => {
    //     const receiver = randomAddress();
    //     const now = unixNow();
    //     const params = {
    //         expire: now + 30,
    //         mintTo: receiver,
    //         data1: new BN(0),
    //         seed: defaultConfig.seed
    //     };
    //     const hash = Queries.mine(params).hash();
    //
    //     const config = Object.assign({}, defaultConfig);
    //     config.powComplexity = new BN(hash, 10, 'be');
    //     config.lastSuccess = now - 30;
    //
    //     const collection = await NftGiver.createFromConfig(config);
    //     collection.contract.setUnixTime(now);
    //
    //     const res = await collection.sendMineNft(randomAddress(), params);
    //
    //     expect(res.exit_code).toBe(24);
    // });
    //
    // it('should rescale', async () => {
    //     const config = Object.assign({}, defaultConfig);
    //     const now = unixNow();
    //     config.lastSuccess = now - config.targetDelta * 16;
    //     config.powComplexity = new BN(1).shln(config.minComplexity);
    //
    //     const collection = await NftGiver.createFromConfig(config);
    //     collection.contract.setUnixTime(now);
    //
    //     const res = await collection.sendRescaleComplexity(randomAddress(), { expire: now - 1 });
    //
    //     expect(res.exit_code).toBe(0);
    //
    //     const miningData = await collection.getMiningData();
    //
    //     expect(miningData.powComplexity.gt(config.powComplexity)).toBeTruthy();
    // });
    //
    // it('should not rescale if not enough time passed', async () => {
    //     const config = Object.assign({}, defaultConfig);
    //     const now = unixNow();
    //     config.lastSuccess = now - config.targetDelta * 16 + 1; // this should make rescale fail
    //
    //     const collection = await NftGiver.createFromConfig(config);
    //     collection.contract.setUnixTime(now);
    //
    //     const res = await collection.sendRescaleComplexity(randomAddress(), { expire: now - 1 });
    //
    //     expect(res.exit_code).toBe(30);
    // });
    //
    // it('should return collection data', async () => {
    //     let collection = await NftGiver.createFromConfig(defaultConfig);
    //
    //     let res = await collection.getCollectionData();
    //
    //     expect(res.nextItemId).toEqual(defaultConfig.nextItemIndex);
    //     expect(res.collectionContent).toEqual(defaultConfig.collectionContent);
    //     expect(res.ownerAddress.toFriendly()).toEqual(defaultConfig.ownerAddress.toFriendly());
    // });
    //
    // it('should return nft content', async () => {
    //     let collection = await NftGiver.createFromConfig(defaultConfig);
    //
    //     let nftContent = new Cell();
    //     nftContent.bits.writeBuffer(Buffer.from('1'));
    //     // nftContent.bits.writeString('1')
    //
    //     let res = await collection.getNftContent(0, nftContent);
    //     expect(res).toEqual(defaultConfig.commonContent + '1');
    // });
    //
    // it('should return nft address by index', async () => {
    //     let collection = await NftGiver.createFromConfig(defaultConfig);
    //
    //     let index = 77;
    //
    //     let res = await collection.getNftAddressByIndex(index);
    //
    //     // Basic nft item data
    //     let nftItemData = new Cell();
    //     nftItemData.bits.writeUint(index, 64);
    //     nftItemData.bits.writeAddress(collection.address);
    //
    //     let expectedAddress = contractAddress({
    //         workchain: 0,
    //         initialCode: defaultConfig.nftItemCode,
    //         initialData: nftItemData
    //     });
    //
    //     expect(res.toFriendly()).toEqual(expectedAddress.toFriendly());
    // });
    //
    // it('should return royalty params', async () => {
    //     let collection = await NftGiver.createFromConfig(defaultConfig);
    //
    //     let res = await collection.getRoyaltyParams();
    //
    //     expect(res.royaltyBase).toEqual(defaultConfig.royaltyParams.royaltyBase);
    //     expect(res.royaltyFactor).toEqual(defaultConfig.royaltyParams.royaltyFactor);
    //     expect(res.royaltyAddress.toFriendly()).toEqual(defaultConfig.royaltyParams.royaltyAddress.toFriendly());
    // });
    //
    // it('should change owner', async () => {
    //     let collection = await NftGiver.createFromConfig(defaultConfig);
    //     let newOwner = randomAddress();
    //
    //     let res = await collection.sendChangeOwner(randomAddress(), newOwner);
    //     // Should fail if caller is not current user
    //     expect(res.exit_code).not.toEqual(0);
    //
    //     res = await collection.sendChangeOwner(OWNER_ADDRESS, newOwner);
    //
    //     expect(res.exit_code).toBe(0);
    //     let data = await collection.getCollectionData();
    //     expect(data.ownerAddress.toFriendly()).toEqual(newOwner.toFriendly());
    // });
    //
    // it('should send royalty params', async () => {
    //     let collection = await NftGiver.createFromConfig(defaultConfig);
    //     let sender = randomAddress();
    //     let res = await collection.sendGetRoyaltyParams(sender);
    //
    //     expect(res.exit_code).toBe(0);
    //     if (res.type !== 'success') {
    //         throw new Error();
    //     }
    //
    //     let [responseMessage] = res.actionList as [SendMsgAction];
    //
    //     expect(responseMessage.message.info.dest!.toString()).toEqual(sender.toString());
    //     let response = responseMessage.message.body.beginParse();
    //
    //     let op = response.readUintNumber(32);
    //     let queryId = response.readUintNumber(64);
    //     let royaltyFactor = response.readUintNumber(16);
    //     let royaltyBase = response.readUintNumber(16);
    //     let royaltyAddress = response.readAddress()!;
    //
    //     expect(op).toEqual(OpCodes.GetRoyaltyParamsResponse);
    //     expect(queryId).toEqual(0);
    //     expect(royaltyFactor).toEqual(defaultConfig.royaltyParams.royaltyFactor);
    //     expect(royaltyBase).toEqual(defaultConfig.royaltyParams.royaltyBase);
    //     expect(royaltyAddress.toFriendly()).toEqual(defaultConfig.royaltyParams.royaltyAddress.toFriendly());
    // });
    //
    // it('should edit content', async () => {
    //     let collection = await NftGiver.createFromConfig(defaultConfig);
    //     let sender = randomAddress();
    //
    //     let royaltyAddress = randomAddress();
    //     let res = await collection.sendEditContent(sender, {
    //         collectionContent: 'new_content',
    //         commonContent: 'new_common_content',
    //         royaltyParams: {
    //             royaltyFactor: 150,
    //             royaltyBase: 220,
    //             royaltyAddress
    //         }
    //     });
    //     // should fail if sender is not owner
    //     expect(res.exit_code).not.toEqual(0);
    //
    //     res = await collection.sendEditContent(OWNER_ADDRESS, {
    //         collectionContent: 'new_content',
    //         commonContent: 'new_common_content',
    //         royaltyParams: {
    //             royaltyFactor: 150,
    //             royaltyBase: 220,
    //             royaltyAddress
    //         }
    //     });
    //
    //     expect(res.exit_code).toBe(0);
    //     if (res.type !== 'success') {
    //         throw new Error();
    //     }
    //
    //     let data = await collection.getCollectionData();
    //     expect(data.collectionContent).toEqual('new_content');
    //     let royalty = await collection.getRoyaltyParams();
    //     expect(royalty.royaltyBase).toEqual(220);
    //     expect(royalty.royaltyFactor).toEqual(150);
    //     expect(royalty.royaltyAddress.toFriendly()).toEqual(royaltyAddress.toFriendly());
    // });

});
