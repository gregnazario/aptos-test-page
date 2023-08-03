import {Alert, Button, Col, Input, Layout, Row} from "antd";
import {WalletSelector} from "@aptos-labs/wallet-adapter-ant-design";
import "@aptos-labs/wallet-adapter-ant-design/dist/index.css";
import {Network, Provider, Types} from "aptos";
import {useWallet} from "@aptos-labs/wallet-adapter-react";
import {useState} from "react";

export const DEVNET_CLIENT = new Provider(Network.DEVNET);
export const TESTNET_CLIENT = new Provider(Network.TESTNET);
export const MAINNET_CLIENT = new Provider(Network.MAINNET);

export const ORDER_QUERY = "query Offer($offer_id: jsonb!) {\n" +
    "  current_table_items(\n" +
    "    where: {table_handle: {_eq: \"0xb1f502b4e7f8604123412509ec2aebb651b3e162014b88d565cff2d2544745af\"}, decoded_key: {_eq: $offer_id}}\n" +
    "  ) {\n" +
    "    decoded_key\n" +
    "    decoded_value\n" +
    "  }\n" +
    "}";

type Offers = {
    current_table_items: {
        decoded_key: string,
        decoded_value: {
            state: number,
            sender: string,
            offer_id: string,
            receiver: string,
            send_tokens: {
                token_data_id: {
                    name: string,
                    creator: string,
                    collection: string
                },
                property_version: string
            }[],
            receive_tokens: {
                token_data_id: {
                    name: string,
                    creator: string,
                    collection: string
                },
                property_version: string
            }[],
            extra_sender_pay: string,
            extra_receiver_pay: string
        }
    }[]
};

type OfferOutput = {
    sender: string,
    coins: number,
    tokens: {
        collection: string,
        name: string,
    }[],
};

function App(props: { expectedNetwork: Network }) {
    const {network, connected, signAndSubmitTransaction, wallet} = useWallet();
    const [offer, setOffer] = useState<OfferOutput | undefined>();
    const [offerId, setOfferId] = useState<string>("");

    const isExpectedNetwork = (): boolean => {
        return network?.name?.toLowerCase() === props.expectedNetwork;
    }
    const isDevnet = (): boolean => {
        // There's a very specific override here for Martian
        return (network?.name as string)?.toLowerCase() === 'devnet' || (wallet?.name === "Martian" && network?.name.toLowerCase() === "custom");
    }

    const isTestnet = (): boolean => {
        // There's a very specific override here for Martian
        return (network?.name as string)?.toLowerCase() === 'testnet';
    }

    const fetchOffer = async () => {
        let client = getProvider();
        let response = await client.queryIndexer<Offers>({query: ORDER_QUERY, variables: {offer_id: offerId}});

        let tokens = [];
        let coins = 0;
        let sender = "";
        for (let offer of response.current_table_items) {
            coins = Number(offer.decoded_value.extra_sender_pay);
            sender = offer.decoded_value.sender;

            for (let token of offer.decoded_value.send_tokens) {
                tokens.push({
                    collection: token.token_data_id.collection,
                    name: token.token_data_id.name,
                })
            }
        }

        setOffer({
            sender: sender,
            coins: coins,
            tokens: tokens,
        });
    }

    const cancelOffer = async (setState: TxnCallback) => {
        await runTransaction(
            setState,
            {
                type: "entry_function_payload",
                function: `0x615bda72f7575d876e29dd2f73691e46b4b14df8a1602aadc23b52d4ab4852b7::p2pswap::cancel_offer`,
                type_arguments: [],
                arguments: [
                    offerId,
                ],
            })
    }

    const onStringChange = async (event: React.ChangeEvent<HTMLInputElement>, setter: (value: (((prevState: string) => string) | string)) => void): Promise<string> => {
        const val = event.target.value;
        setter(val);
        return val;
    }

    const getProvider = (): Provider => {
        let client: Provider;
        if (isDevnet()) {
            client = DEVNET_CLIENT;
        } else if (isTestnet()) {
            client = TESTNET_CLIENT;
        } else {
            client = MAINNET_CLIENT;
        }
        return client;
    }

    const runTransaction = async <T extends Types.TransactionPayload>(setState: TxnCallback, payload: T) => {
        console.log(`Running payload: ${JSON.stringify(payload)}`);
        let client = getProvider();

        try {
            const response = await signAndSubmitTransaction(payload);
            console.log(`Successfully submitted`);
            await client.waitForTransaction(response.hash);
            console.log(`Successfully committed`);
            let txn = await client.getTransactionByHash(response.hash) as any;
            console.log(`Txn: ${JSON.stringify(txn)}`);
            setState({state: "success", msg: `Successful txn ${txn.hash}`})
            return txn;
        } catch (error: any) {
            console.log("Failed to wait for txn" + error)
            setState({state: "error", msg: `Failed txn due to ${JSON.stringify(error)}`})
        }

        return undefined;
    }

    return (
        <>
            <Layout>
                <Row align="middle">
                    <Col span={10} offset={2}>
                        <h1>Wallet tester ({props.expectedNetwork}) <a
                            href="https://github.com/gregnazario/aptos-wallet-tester">Source Code</a></h1>
                    </Col>
                    <Col span={12} style={{textAlign: "right", paddingRight: "200px"}}>
                        <WalletSelector/>
                    </Col>
                </Row>
            </Layout>
            {
                !connected &&
                <Alert message={`Please connect your wallet to ${props.expectedNetwork}`} type="info"/>
            }
            {
                connected && (!isExpectedNetwork()) &&
                <Alert message={`Wallet is connected to ${network?.name}.  Please connect to ${props.expectedNetwork}`}
                       type="warning"/>
            }
            {connected && (isExpectedNetwork()) &&
                <Layout>
                    <EasyTitle msg="Enter your Offer Id here"/>
                    <Row>
                        <Col offset={2} span={1}>
                            <h3>Offer Id:</h3>
                        </Col>
                        <Col flex={"auto"}>
                            <Input
                                onChange={(event) => {
                                    onStringChange(event, setOfferId);
                                }}
                                style={{width: "calc(100% - 60px)"}}
                                placeholder="Offer Id"
                                size="large"
                                defaultValue={""}
                            />
                        </Col>
                    </Row>
                    <EasyTitle msg="See offer"/>
                    <EasyButton msg="Show offer" func={fetchOffer}/>
                    {offer && <Row>
                        <Col offset={2} flex={"auto"}>
                            Sender: {offer.sender}
                        </Col>
                        <Col offset={2} flex={"auto"}>
                            Coins: {offer.coins}
                        </Col>
                        <Col offset={2} flex={"auto"}>
                            Tokens: {JSON.stringify(offer.tokens)}
                        </Col>
                    </Row>}
                    <EasyTitle msg="Cancel offer"/>
                    <EasyButton msg="Cancel" func={cancelOffer}/>
                </Layout>
            }
        </>
    );
}

type ButtonState = { msg: string, state: ReturnState };
type ReturnState = "success" | "error" | undefined;
type TxnCallback = (state: ButtonState) => void;

const toState = (state: ReturnState): "success" | "error" | "info" => {
    if (state !== undefined) {
        return state
    } else {
        return "info"
    }
}

function EasyButton(props: { msg: string, func: (setState: TxnCallback) => Promise<void> }) {
    const [state, setState] = useState<ButtonState>({msg: "", state: undefined});
    return <Row align="middle">
        <Col offset={2}>
            <Button
                onClick={() => props.func(setState)}
                type="primary"
                style={{height: "40px", backgroundColor: "#3f67ff"}}
            >
                {props.msg}
            </Button>
        </Col>
        <Col offset={2}>
            {state.state &&
                <Alert type={toState(state.state)} message={state.msg}/>
            }
        </Col>
    </Row>;
}

function EasyTitle(props: { msg: string }) {
    return <Row align="middle">
        <Col offset={2}>
            <h2>{props.msg}</h2>
        </Col>
    </Row>;
}


export default App;